package com.markly.backend.web;

import com.markly.backend.domain.Grade;
import com.markly.backend.domain.Role;
import com.markly.backend.domain.StudentProfile;
import com.markly.backend.domain.User;
import com.markly.backend.repository.GradeRepository;
import com.markly.backend.repository.StudentProfileRepository;
import com.markly.backend.repository.UserRepository;
import com.markly.backend.service.StudentProfileNormalizer;
import com.markly.backend.service.StudentRosterService;
import com.markly.backend.service.UserValidationService;
import com.markly.backend.web.dto.AdminGradeResponse;
import com.markly.backend.web.dto.CreateUserRequest;
import com.markly.backend.web.dto.StudentProfileResponse;
import com.markly.backend.web.dto.StudentRosterResponse;
import com.markly.backend.web.dto.UpdateUserStatusRequest;
import com.markly.backend.web.dto.UpsertStudentProfileRequest;
import com.markly.backend.web.dto.UserResponse;
import com.markly.backend.security.AppUserPrincipal;
import jakarta.validation.Valid;
import org.hibernate.exception.ConstraintViolationException;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

@RestController
@RequestMapping("/api/admin")
public class AdminController {

    private static final Logger audit = LoggerFactory.getLogger("com.markly.audit");

    /** Name of the unique index from V8, matched below to scope the DataIntegrityViolationException catch. */
    private static final String FACULTY_NUMBER_UNIQUE_INDEX = "idx_student_profiles_faculty_number";

    private final UserRepository userRepository;
    private final UserValidationService userValidationService;
    private final PasswordEncoder passwordEncoder;
    private final StudentProfileRepository studentProfileRepository;
    private final GradeRepository gradeRepository;
    private final StudentRosterService studentRosterService;

    public AdminController(
            UserRepository userRepository,
            UserValidationService userValidationService,
            PasswordEncoder passwordEncoder,
            StudentProfileRepository studentProfileRepository,
            GradeRepository gradeRepository,
            StudentRosterService studentRosterService) {
        this.userRepository = userRepository;
        this.userValidationService = userValidationService;
        this.passwordEncoder = passwordEncoder;
        this.studentProfileRepository = studentProfileRepository;
        this.gradeRepository = gradeRepository;
        this.studentRosterService = studentRosterService;
    }

    @GetMapping("/users")
    public List<UserResponse> listUsers() {
        return userRepository.findAll().stream()
                .map(UserResponse::from)
                .toList();
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
            @AuthenticationPrincipal AppUserPrincipal currentAdmin) {
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
        audit.warn("ACCOUNT_STATUS_CHANGED username='{}' enabled={} by='{}'",
                user.getUsername(), request.enabled(), currentAdmin.getUsername());
        return UserResponse.from(userRepository.save(user));
    }

    /** Lifts a brute-force lockout before its 15 minutes are up. */
    @PostMapping("/users/{id}/unlock")
    public UserResponse unlockUser(@PathVariable Long id, @AuthenticationPrincipal AppUserPrincipal currentAdmin) {
        User user = userRepository.findById(id)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Няма потребител с този идентификатор"));
        user.setLockedUntil(null);
        user.setFailedLoginAttempts(0);
        audit.info("ACCOUNT_UNLOCKED username='{}' by='{}'", user.getUsername(), currentAdmin.getUsername());
        return UserResponse.from(userRepository.save(user));
    }

    /** Shared with the teacher roster ({@code TeacherController}) via {@link StudentRosterService}. */
    @GetMapping("/students")
    public List<StudentRosterResponse> allStudents() {
        return studentRosterService.allStudents();
    }

    /**
     * System-wide grades, across every teacher and student — the admin
     * counterpart to {@code TeacherController#myGrades}. Deliberately
     * unpaginated, consistent with that endpoint's own per-teacher list; fine
     * at this app's current scale, but the first endpoint likely to need
     * pagination if the dataset grows.
     */
    @GetMapping("/grades")
    public List<AdminGradeResponse> allGrades() {
        List<Grade> grades = gradeRepository.findAllByOrderByCreatedAtDesc();
        Set<User> students = grades.stream().map(Grade::getStudent).collect(Collectors.toSet());
        Map<Long, StudentProfile> profilesByStudentId = students.isEmpty()
                ? Map.of()
                : studentProfileRepository.findByStudentIn(students).stream()
                        .collect(Collectors.toMap(p -> p.getStudent().getId(), p -> p));
        return grades.stream()
                .map(g -> AdminGradeResponse.from(g, profilesByStudentId.get(g.getStudent().getId())))
                .toList();
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
