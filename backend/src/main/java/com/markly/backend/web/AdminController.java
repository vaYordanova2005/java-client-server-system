package com.markly.backend.web;

import com.markly.backend.domain.Grade;
import com.markly.backend.domain.Role;
import com.markly.backend.domain.StudentProfile;
import com.markly.backend.domain.User;
import com.markly.backend.repository.AuditLogRepository;
import com.markly.backend.repository.CalendarEventRepository;
import com.markly.backend.repository.GradeRepository;
import com.markly.backend.repository.StudentProfileRepository;
import com.markly.backend.repository.SubjectAssignmentRepository;
import com.markly.backend.repository.UserRepository;
import com.markly.backend.security.ClientIpResolver;
import com.markly.backend.service.AuditLogService;
import com.markly.backend.service.StudentProfileNormalizer;
import com.markly.backend.service.StudentRosterService;
import com.markly.backend.service.UserImportService;
import com.markly.backend.service.UserValidationService;
import com.markly.backend.web.dto.AdminGradeResponse;
import com.markly.backend.web.dto.AdminResetPasswordRequest;
import com.markly.backend.web.dto.AuditLogResponse;
import com.markly.backend.web.dto.CreateUserRequest;
import com.markly.backend.web.dto.ImportUsersResponse;
import com.markly.backend.web.dto.PageResponse;
import com.markly.backend.web.dto.StudentProfileResponse;
import com.markly.backend.web.dto.StudentRosterResponse;
import com.markly.backend.web.dto.UpdateUserStatusRequest;
import com.markly.backend.web.dto.UpsertStudentProfileRequest;
import com.markly.backend.web.dto.UserResponse;
import com.markly.backend.security.AppUserPrincipal;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import org.hibernate.exception.ConstraintViolationException;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.server.ResponseStatusException;

import java.io.IOException;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;

@RestController
@RequestMapping("/api/admin")
public class AdminController {

    /** Name of the unique index from V8, matched below to scope the DataIntegrityViolationException catch. */
    private static final String FACULTY_NUMBER_UNIQUE_INDEX = "idx_student_profiles_faculty_number";

    /**
     * Content types actually seen in the wild for a CSV export, across
     * browsers/OSes/Excel — there is no single standard one. Checked only as
     * a fallback when the filename itself doesn't end in {@code .csv} (see
     * {@link #validateImportFile}), since content type is client-supplied and
     * easy to get wrong (or spoof) on its own.
     */
    private static final Set<String> ALLOWED_IMPORT_CONTENT_TYPES =
            Set.of("text/csv", "application/csv", "application/vnd.ms-excel", "text/plain");

    private final UserRepository userRepository;
    private final UserValidationService userValidationService;
    private final PasswordEncoder passwordEncoder;
    private final StudentProfileRepository studentProfileRepository;
    private final GradeRepository gradeRepository;
    private final StudentRosterService studentRosterService;
    private final AuditLogRepository auditLogRepository;
    private final AuditLogService auditLogService;
    private final ClientIpResolver clientIpResolver;
    private final CalendarEventRepository calendarEventRepository;
    private final UserImportService userImportService;
    private final SubjectAssignmentRepository subjectAssignmentRepository;

    public AdminController(
            UserRepository userRepository,
            UserValidationService userValidationService,
            PasswordEncoder passwordEncoder,
            StudentProfileRepository studentProfileRepository,
            GradeRepository gradeRepository,
            StudentRosterService studentRosterService,
            AuditLogRepository auditLogRepository,
            AuditLogService auditLogService,
            ClientIpResolver clientIpResolver,
            CalendarEventRepository calendarEventRepository,
            UserImportService userImportService,
            SubjectAssignmentRepository subjectAssignmentRepository) {
        this.userRepository = userRepository;
        this.userValidationService = userValidationService;
        this.passwordEncoder = passwordEncoder;
        this.studentProfileRepository = studentProfileRepository;
        this.gradeRepository = gradeRepository;
        this.studentRosterService = studentRosterService;
        this.auditLogRepository = auditLogRepository;
        this.auditLogService = auditLogService;
        this.clientIpResolver = clientIpResolver;
        this.calendarEventRepository = calendarEventRepository;
        this.userImportService = userImportService;
        this.subjectAssignmentRepository = subjectAssignmentRepository;
    }

    /**
     * Paginated (unlike {@code /audit-log}'s filters, there's nothing to
     * narrow this by yet) so the admin roster stays a bounded query as the
     * user base grows, rather than one unbounded {@code SELECT *} whose
     * response only gets bigger over time. Newest-first, same as the audit
     * log: a freshly created account then shows up on page 0 instead of the
     * last page, without the frontend having to track/jump to it after a
     * create.
     */
    @GetMapping("/users")
    public PageResponse<UserResponse> listUsers(
            @RequestParam(defaultValue = "0") int page, @RequestParam(defaultValue = "50") int size) {
        Page<User> users = userRepository.findAll(PageRequest.of(page, size, Sort.by(Sort.Direction.DESC, "id")));
        return PageResponse.from(users, UserResponse::from);
    }

    @PostMapping("/users")
    @ResponseStatus(HttpStatus.CREATED)
    public UserResponse createUser(@Valid @RequestBody CreateUserRequest request) {
        Role role = request.role();
        userValidationService.validate(role, request.username(), request.password());

        if (userRepository.existsByUsernameIgnoreCase(request.username())) {
            throw new IllegalArgumentException("Потребителското име вече съществува");
        }

        User user = new User(request.username(), passwordEncoder.encode(request.password()), role);
        return UserResponse.from(userRepository.save(user));
    }

    /**
     * Bulk counterpart to {@link #createUser}: one row per account
     * ({@code role,username,password}), each validated and saved
     * independently so a typo in one row doesn't lose the rest of a large
     * import. See {@link UserImportService} for the CSV-parsing details
     * (header matching, BOM handling).
     */
    @PostMapping("/users/import")
    public ImportUsersResponse importUsers(
            @RequestParam("file") MultipartFile file,
            @AuthenticationPrincipal AppUserPrincipal currentAdmin,
            HttpServletRequest httpRequest) throws IOException {
        validateImportFile(file);
        ImportUsersResponse response = userImportService.importUsers(file.getInputStream());
        // Never row contents, usernames, or the uploaded filename — only the
        // aggregate counts, since the file is user-supplied and may contain
        // plaintext passwords.
        auditLogService.record("USERS_IMPORTED", currentAdmin.getUsername(), null,
                clientIpResolver.resolve(httpRequest), "created=" + response.created() + " skipped=" + response.skipped());
        return response;
    }

    /**
     * Rejects obviously-not-a-CSV uploads before they ever reach {@link
     * UserImportService}'s parser, which otherwise has no reason to expect
     * anything but well-formed CSV text and would surface garbage input (an
     * image, an archive, ...) as a raw parse exception -> 500 instead of a
     * friendly 400. File *size* is deliberately not re-checked here — {@code
     * spring.servlet.multipart.max-file-size} (see {@code application.yml})
     * already bounds it, and {@link com.markly.backend.exception.ApiExceptionHandler}
     * already turns a breach into the same friendly 400.
     */
    private void validateImportFile(MultipartFile file) {
        if (file.isEmpty()) {
            throw new IllegalArgumentException("Файлът е празен");
        }
        String filename = file.getOriginalFilename();
        boolean hasCsvExtension = filename != null && filename.toLowerCase(Locale.ROOT).endsWith(".csv");
        String contentType = file.getContentType();
        boolean hasAllowedContentType =
                contentType != null && ALLOWED_IMPORT_CONTENT_TYPES.contains(contentType.toLowerCase(Locale.ROOT));
        if (!hasCsvExtension && !hasAllowedContentType) {
            throw new IllegalArgumentException("Очаква се CSV файл (.csv)");
        }
    }

    /**
     * Deactivating is the missing middle ground between leaving a compromised
     * account usable and deleting it outright (which would take the user's
     * grades and profile with it). The token version is bumped either way, so
     * a session that is already open stops working on the next request
     * instead of lingering until the token expires.
     */
    @PutMapping("/users/{id}/status")
    public UserResponse updateUserStatus(
            @PathVariable Long id,
            @Valid @RequestBody UpdateUserStatusRequest request,
            @AuthenticationPrincipal AppUserPrincipal currentAdmin,
            HttpServletRequest httpRequest) {
        User user = userRepository.findById(id)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Няма потребител с този идентификатор"));
        if (user.getUsername().equalsIgnoreCase(currentAdmin.getUsername())) {
            throw new IllegalArgumentException("Не можете да деактивирате собствения си акаунт");
        }

        user.setEnabled(request.enabled());
        user.setTokenVersion(user.getTokenVersion() + 1);
        if (request.enabled()) {
            user.setLockedUntil(null);
            user.setFailedLoginAttempts(0);
        }
        auditLogService.record("ACCOUNT_STATUS_CHANGED", currentAdmin.getUsername(), user.getUsername(),
                clientIpResolver.resolve(httpRequest), "enabled=" + request.enabled());
        return UserResponse.from(userRepository.save(user));
    }

    /** Lifts a brute-force lockout before its 15 minutes are up. */
    @PostMapping("/users/{id}/unlock")
    public UserResponse unlockUser(
            @PathVariable Long id, @AuthenticationPrincipal AppUserPrincipal currentAdmin, HttpServletRequest httpRequest) {
        User user = userRepository.findById(id)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Няма потребител с този идентификатор"));
        user.setLockedUntil(null);
        user.setFailedLoginAttempts(0);
        auditLogService.record("ACCOUNT_UNLOCKED", currentAdmin.getUsername(), user.getUsername(),
                clientIpResolver.resolve(httpRequest), null);
        return UserResponse.from(userRepository.save(user));
    }

    /**
     * Hard delete, guarded: blocked with 409 if the account has any grade or
     * calendar-event history, since deleting it would silently discard that
     * history, or any subject assignment, whose {@code NOT NULL} FK to
     * {@code users} (V11) the delete would violate outright — the mirror
     * image of {@code AdminSubjectController#deleteSubjectPermanently}'s
     * guard on the same relation — {@code updateUserStatus} (deactivate) is the reversible
     * option for that case. A student's registrar profile is deleted in the
     * same transaction as a stated, explicit part of this operation (not an
     * incidental side effect): because {@code StudentProfile.facultyNumber}
     * is unique (V8), this frees the deleted student's faculty number for
     * reuse — the frontend confirm dialog says so explicitly.
     */
    @DeleteMapping("/users/{id}")
    @Transactional
    public void deleteUser(
            @PathVariable Long id,
            @AuthenticationPrincipal AppUserPrincipal currentAdmin,
            HttpServletRequest httpRequest) {
        User user = userRepository.findById(id)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Няма потребител с този идентификатор"));
        if (user.getUsername().equalsIgnoreCase(currentAdmin.getUsername())) {
            throw new IllegalArgumentException("Не можете да изтриете собствения си акаунт");
        }
        if (gradeRepository.existsByStudent(user)
                || gradeRepository.existsByTeacher(user)
                || calendarEventRepository.existsByCreatedBy(user)
                || subjectAssignmentRepository.existsByTeacher(user)) {
            throw new ResponseStatusException(HttpStatus.CONFLICT,
                    "Потребителят има свързани данни (оценки, календарни събития или разпределения по предмети) — деактивирайте акаунта вместо да го изтривате");
        }
        studentProfileRepository.findByStudent(user).ifPresent(studentProfileRepository::delete);
        userRepository.delete(user);
        auditLogService.record("USER_DELETED", currentAdmin.getUsername(), user.getUsername(),
                clientIpResolver.resolve(httpRequest), "role=" + user.getRole());
    }

    /**
     * Admin sets the new password directly, same UX as account creation —
     * there is no email/token infrastructure in this app to deliver a reset
     * link, so a forced-change-on-next-login flow is a reasonable fast
     * follow, not v1 scope. The token version is bumped (invalidates any
     * open session, same as {@link #updateUserStatus}) and any lockout is
     * cleared, since a reset is also a legitimate way to recover a locked
     * account.
     */
    @PostMapping("/users/{id}/reset-password")
    public UserResponse resetPassword(
            @PathVariable Long id,
            @Valid @RequestBody AdminResetPasswordRequest request,
            @AuthenticationPrincipal AppUserPrincipal currentAdmin,
            HttpServletRequest httpRequest) {
        User user = userRepository.findById(id)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Няма потребител с този идентификатор"));
        userValidationService.validatePassword(user.getUsername(), request.newPassword());

        user.setPassword(passwordEncoder.encode(request.newPassword()));
        user.setTokenVersion(user.getTokenVersion() + 1);
        user.setLockedUntil(null);
        user.setFailedLoginAttempts(0);
        // Never the new password itself — only that a reset happened.
        auditLogService.record("PASSWORD_RESET", currentAdmin.getUsername(), user.getUsername(),
                clientIpResolver.resolve(httpRequest), null);
        return UserResponse.from(userRepository.save(user));
    }

    /**
     * {@code involving} is a convenience filter that matches either column —
     * useful for "anything about this person," since {@code actorUsername}
     * and {@code targetUsername} differ for most events (e.g. one admin
     * deleting another user's account) and a plain {@code username} filter
     * would be ambiguous about which one it means.
     */
    @GetMapping("/audit-log")
    public PageResponse<AuditLogResponse> auditLog(
            @RequestParam(required = false) String eventType,
            @RequestParam(required = false) String actorUsername,
            @RequestParam(required = false) String targetUsername,
            @RequestParam(required = false) String involving,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "50") int size) {
        var result = auditLogRepository.search(
                eventType, actorUsername, targetUsername, involving, PageRequest.of(page, size));
        return PageResponse.from(result, AuditLogResponse::from);
    }

    /** Shared with the teacher roster ({@code TeacherController}) via {@link StudentRosterService}. */
    @GetMapping("/students")
    public List<StudentRosterResponse> allStudents() {
        return studentRosterService.allStudents();
    }

    /**
     * System-wide grades, across every teacher and student — the admin
     * counterpart to {@code TeacherController#myGrades}. Paginated (unlike
     * that per-teacher list, whose scope is bounded by definition): the
     * frontend's journal/statistics views aggregate over every admin grade,
     * so they page through this themselves and concatenate rather than
     * receiving that aggregation pre-computed here — but each individual
     * request/query this endpoint makes now stays bounded regardless of how
     * large the overall dataset grows.
     */
    @GetMapping("/grades")
    public PageResponse<AdminGradeResponse> allGrades(
            @RequestParam(defaultValue = "0") int page, @RequestParam(defaultValue = "50") int size) {
        Page<Grade> grades = gradeRepository.findAllByOrderByCreatedAtDesc(PageRequest.of(page, size));
        Set<User> students = grades.getContent().stream().map(Grade::getStudent).collect(Collectors.toSet());
        Map<Long, StudentProfile> profilesByStudentId = students.isEmpty()
                ? Map.of()
                : studentProfileRepository.findByStudentIn(students).stream()
                        .collect(Collectors.toMap(p -> p.getStudent().getId(), p -> p));
        return PageResponse.from(grades, g -> AdminGradeResponse.from(g, profilesByStudentId.get(g.getStudent().getId())));
    }

    @GetMapping("/students/profile")
    public StudentProfileResponse getStudentProfile(@RequestParam String username) {
        User student = findStudent(username);
        return studentProfileRepository.findByStudent(student)
                .map(profile -> StudentProfileResponse.from(profile, student.getUsername()))
                .orElseGet(() -> StudentProfileResponse.empty(student.getUsername()));
    }

    @PutMapping("/students/profile")
    public StudentProfileResponse upsertStudentProfile(@Valid @RequestBody UpsertStudentProfileRequest request) {
        User student = findStudent(request.studentUsername());
        StudentProfile profile = studentProfileRepository.findByStudent(student)
                .orElseGet(() -> new StudentProfile(student));

        String facultyNumber = StudentProfileNormalizer.normalizeFacultyNumber(request.facultyNumber());
        if (facultyNumber != null && studentProfileRepository.existsByFacultyNumberAndStudentNot(facultyNumber, student)) {
            throw new IllegalArgumentException("Този факултетен номер вече принадлежи на друг ученик");
        }

        profile.setDegreeLevel(request.degreeLevel());
        profile.setFacultyNumber(facultyNumber);
        profile.setFaculty(request.faculty());
        profile.setSpecialty(request.specialty());
        profile.setStudyMode(request.studyMode());
        profile.setSpecialization(request.specialization());
        profile.setGroupNumber(request.groupNumber());
        profile.setAdmissionType(request.admissionType());
        profile.setStatus(request.status());
        profile.setEnrolledSemester(request.enrolledSemester());
        profile.setCompletedSemester(request.completedSemester());
        profile.setStream(request.stream());

        try {
            return StudentProfileResponse.from(studentProfileRepository.save(profile), student.getUsername());
        } catch (DataIntegrityViolationException ex) {
            // The existsByFacultyNumberAndStudentNot check above closes most
            // of the window, but two concurrent requests can both pass it
            // before either commits — the unique index on faculty_number
            // (V8) is what actually catches that race, and it fails as a
            // generic constraint violation rather than the friendly message
            // above. Same user-facing outcome either way: 400, not 500.
            //
            // Only rewritten when it's actually that index: this table has
            // exactly one constraint today, but a future NOT NULL or foreign
            // key added here would also come through as a
            // DataIntegrityViolationException, and mislabeling *that* as a
            // duplicate faculty number would be more confusing than the raw
            // 500 it would otherwise produce.
            if (!isFacultyNumberUniqueViolation(ex)) {
                throw ex;
            }
            throw new IllegalArgumentException("Този факултетен номер вече принадлежи на друг ученик");
        }
    }

    // Package-private (not private) so AdminStudentProfileTest can assert on this exact method
    // against a real database exception instead of re-deriving the matching rule by hand.
    boolean isFacultyNumberUniqueViolation(DataIntegrityViolationException ex) {
        // Spring's translator wraps the Hibernate exception one level deep
        // (DataIntegrityViolationException -> ConstraintViolationException ->
        // the driver's SQLException) — getCause(), not getMostSpecificCause(),
        // which would walk past ConstraintViolationException to that
        // SQLException and never match here.
        Throwable cause = ex.getCause();
        if (!(cause instanceof ConstraintViolationException constraintViolation)) {
            return false;
        }
        String constraintName = constraintViolation.getConstraintName();
        if (constraintName == null) {
            return false;
        }
        // Equality, or a schema-qualified suffix — not a bare substring/contains:
        // real PostgreSQL reports the bare index name
        // ("idx_student_profiles_faculty_number"), but other Hibernate dialects
        // can schema-qualify and upper-case it (H2, used in tests, reports
        // "PUBLIC.IDX_STUDENT_PROFILES_FACULTY_NUMBER"). A plain `contains` would
        // also match a future, unrelated index that merely starts with this name
        // (e.g. idx_student_profiles_faculty_number_and_year) — the same kind of
        // silent mislabeling this match exists to avoid, just moved one step
        // over. Caught by
        // AdminStudentProfileTest#theRealDatabaseReportsAConstraintNameTheControllerCanMatch,
        // which triggers the real index against the test database instead of a
        // hand-built exception.
        String normalized = constraintName.toLowerCase(Locale.ROOT);
        return normalized.equals(FACULTY_NUMBER_UNIQUE_INDEX)
                || normalized.endsWith("." + FACULTY_NUMBER_UNIQUE_INDEX);
    }

    private User findStudent(String username) {
        return userRepository.findByUsernameIgnoreCase(username)
                .filter(u -> u.getRole() == Role.STUDENT)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Няма ученик с такъв имейл"));
    }
}
