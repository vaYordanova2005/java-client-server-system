package com.markly.backend.config;

import com.markly.backend.domain.Grade;
import com.markly.backend.domain.GradeType;
import com.markly.backend.domain.Role;
import com.markly.backend.domain.StudentProfile;
import com.markly.backend.domain.User;
import com.markly.backend.repository.GradeRepository;
import com.markly.backend.repository.StudentProfileRepository;
import com.markly.backend.repository.UserRepository;
import com.markly.backend.service.UserValidationService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.CommandLineRunner;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

/**
 * Seeds two fixed, always-on restricted demo accounts —
 * {@code teacher@uni-sofia.bg} and {@code student@uni-sofia.bg} — so anyone
 * can try the live app without an admin having to hand out real credentials.
 * Unlike {@link DemoDataSeeder}, this is unconditional: no {@code
 * SEED_DEMO_DATA} gate, runs in every environment including production, same
 * as {@link DataSeeder}'s real admin. Both accounts are flagged {@code
 * isDemo}, which {@code JwtAuthenticationFilter} uses to block every write
 * they attempt, and which scopes what a demo teacher can read (see
 * {@code TeacherController}/{@code StudentRosterService}) so a public demo
 * password can never be used to pull real student data. There is
 * deliberately no demo admin, here or anywhere else.
 */
@Component
public class RestrictedDemoAccountSeeder implements CommandLineRunner {

    private static final Logger log = LoggerFactory.getLogger(RestrictedDemoAccountSeeder.class);

    static final String DEMO_TEACHER_USERNAME = "teacher@uni-sofia.bg";
    static final String DEMO_STUDENT_USERNAME = "student@uni-sofia.bg";
    /** Same constant/convention as {@link DemoDataSeeder} — one shared, documented demo password project-wide. */
    static final String DEMO_PASSWORD = "password12345";

    /** Deliberately non-numeric so it can never collide with a real or bulk-demo faculty number. */
    private static final String DEMO_FACULTY_NUMBER = "DEMO0001";
    private static final List<String> DEMO_SUBJECTS = List.of("Програмиране", "Бази от данни", "Компютърни мрежи");
    private static final int DEMO_SEMESTER = 1;

    private final UserRepository userRepository;
    private final StudentProfileRepository studentProfileRepository;
    private final GradeRepository gradeRepository;
    private final PasswordEncoder passwordEncoder;
    private final UserValidationService userValidationService;

    public RestrictedDemoAccountSeeder(
            UserRepository userRepository,
            StudentProfileRepository studentProfileRepository,
            GradeRepository gradeRepository,
            PasswordEncoder passwordEncoder,
            UserValidationService userValidationService) {
        this.userRepository = userRepository;
        this.studentProfileRepository = studentProfileRepository;
        this.gradeRepository = gradeRepository;
        this.passwordEncoder = passwordEncoder;
        this.userValidationService = userValidationService;
    }

    @Override
    @Transactional
    public void run(String... args) {
        User teacher = userRepository.findByUsernameIgnoreCase(DEMO_TEACHER_USERNAME)
                .orElseGet(() -> createDemoUser(DEMO_TEACHER_USERNAME, Role.TEACHER));
        User student = userRepository.findByUsernameIgnoreCase(DEMO_STUDENT_USERNAME)
                .orElseGet(() -> createDemoUser(DEMO_STUDENT_USERNAME, Role.STUDENT));

        reactivateIfNeeded(teacher);
        reactivateIfNeeded(student);

        if (studentProfileRepository.findByStudent(student).isEmpty()) {
            studentProfileRepository.save(seedProfile(student));
        }
        if (gradeRepository.findByTeacherOrderByCreatedAtDesc(teacher).isEmpty()) {
            seedGrades(student, teacher);
        }

        log.info("Restricted demo accounts ready: {} / {} (password documented in README).",
                DEMO_TEACHER_USERNAME, DEMO_STUDENT_USERNAME);
    }

    private User createDemoUser(String username, Role role) {
        userValidationService.validateDemoPassword(username, DEMO_PASSWORD);
        User user = new User(username, passwordEncoder.encode(DEMO_PASSWORD), role);
        user.setDemo(true);
        return userRepository.save(user);
    }

    /**
     * The demo accounts are meant to always be available in every
     * environment (product decision) — an admin can deactivate one via
     * {@code PUT /api/admin/users/{id}/status}, and unlike a brute-force
     * lockout that's permanent, not time-bound. Every restart undoes it, on
     * purpose: this is the mechanism that keeps "always available" true even
     * after someone accidentally (or deliberately) flips the switch off in
     * the panel.
     */
    private void reactivateIfNeeded(User user) {
        if (!user.isEnabled() || user.getLockedUntil() != null || user.getFailedLoginAttempts() != 0) {
            user.setEnabled(true);
            user.setLockedUntil(null);
            user.setFailedLoginAttempts(0);
            userRepository.save(user);
        }
    }

    private StudentProfile seedProfile(User student) {
        StudentProfile profile = new StudentProfile(student);
        profile.setDegreeLevel("Бакалавър");
        profile.setFacultyNumber(DEMO_FACULTY_NUMBER);
        profile.setFaculty("Факултет компютърни системи и технологии");
        profile.setSpecialty("Компютърно и софтуерно инженерство");
        profile.setStudyMode("редовно");
        profile.setGroupNumber("40");
        profile.setAdmissionType("Държавна поръчка");
        profile.setStatus("Записан");
        profile.setEnrolledSemester(DEMO_SEMESTER);
        profile.setCompletedSemester(0);
        profile.setStream("1");
        return profile;
    }

    private void seedGrades(User student, User teacher) {
        int[] grades = {6, 5, 6};
        for (int i = 0; i < DEMO_SUBJECTS.size(); i++) {
            gradeRepository.save(new Grade(
                    student, teacher, DEMO_SUBJECTS.get(i), DEMO_SEMESTER, grades[i], GradeType.REGULAR));
        }
    }
}
