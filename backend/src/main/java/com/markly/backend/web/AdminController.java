package com.markly.backend.web;

import com.markly.backend.domain.Role;
import com.markly.backend.domain.StudentProfile;
import com.markly.backend.domain.User;
import com.markly.backend.repository.StudentProfileRepository;
import com.markly.backend.repository.UserRepository;
import com.markly.backend.service.StudentProfileNormalizer;
import com.markly.backend.service.UserValidationService;
import com.markly.backend.web.dto.CreateUserRequest;
import com.markly.backend.web.dto.StudentProfileResponse;
import com.markly.backend.web.dto.UpdateUserStatusRequest;
import com.markly.backend.web.dto.UpsertStudentProfileRequest;
import com.markly.backend.web.dto.UserResponse;
import com.markly.backend.security.AppUserPrincipal;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

import java.util.List;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

@RestController
@RequestMapping("/api/admin")
public class AdminController {

    private static final Logger audit = LoggerFactory.getLogger("com.markly.audit");

    private final UserRepository userRepository;
    private final UserValidationService userValidationService;
    private final PasswordEncoder passwordEncoder;
    private final StudentProfileRepository studentProfileRepository;

    public AdminController(
            UserRepository userRepository,
            UserValidationService userValidationService,
            PasswordEncoder passwordEncoder,
            StudentProfileRepository studentProfileRepository) {
        this.userRepository = userRepository;
        this.userValidationService = userValidationService;
        this.passwordEncoder = passwordEncoder;
        this.studentProfileRepository = studentProfileRepository;
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

        return StudentProfileResponse.from(studentProfileRepository.save(profile), student.getUsername());
    }

    private User findStudent(String username) {
        return userRepository.findByUsernameIgnoreCase(username)
                .filter(u -> u.getRole() == Role.STUDENT)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Няма ученик с такъв имейл"));
    }
}
