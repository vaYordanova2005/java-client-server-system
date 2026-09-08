package com.markly.backend.security;

import com.markly.backend.config.RestrictedDemoAccountSeeder;
import com.markly.backend.domain.Role;
import com.markly.backend.domain.StudentProfile;
import com.markly.backend.domain.User;
import com.markly.backend.repository.GradeRepository;
import com.markly.backend.repository.StudentProfileRepository;
import com.markly.backend.repository.UserRepository;
import jakarta.servlet.http.Cookie;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;

import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Covers the restricted demo accounts seeded by {@code RestrictedDemoAccountSeeder}:
 * {@code teacher@uni-sofia.bg} / {@code student@uni-sofia.bg}, password
 * {@code password12345}. These are real, always-seeded singleton rows — this
 * class logs into them directly rather than creating throwaway fixtures for
 * them, the same way it would test against the real seeded admin. Every test
 * performs its own fresh login (never reuses another test's cookie), since
 * {@link #logout} bumps the account's token version and would otherwise
 * invalidate a cookie obtained earlier by a sibling test.
 */
@SpringBootTest
@AutoConfigureMockMvc
class RestrictedDemoAccountTest {

    // Referenced from the seeder rather than duplicated as literals, so a future change to
    // either constant there can't silently desync from what this test logs in as.
    private static final String DEMO_TEACHER_USERNAME = RestrictedDemoAccountSeeder.DEMO_TEACHER_USERNAME;
    private static final String DEMO_STUDENT_USERNAME = RestrictedDemoAccountSeeder.DEMO_STUDENT_USERNAME;
    private static final String DEMO_PASSWORD = RestrictedDemoAccountSeeder.DEMO_PASSWORD;
    private static final String DEMO_MESSAGE_FRAGMENT = "демо акаунт";

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private UserRepository userRepository;

    @Autowired
    private GradeRepository gradeRepository;

    @Autowired
    private StudentProfileRepository studentProfileRepository;

    @Autowired
    private PasswordEncoder passwordEncoder;

    @Autowired
    private RestrictedDemoAccountSeeder restrictedDemoAccountSeeder;

    private final List<Long> createdUserIds = new ArrayList<>();
    private final List<Long> createdProfileIds = new ArrayList<>();

    @AfterEach
    void tearDown() {
        createdProfileIds.forEach(studentProfileRepository::deleteById);
        // A grade created against a fixture (e.g. the real-teacher write test) would
        // otherwise FK-block the user delete below, the same 409 AdminController guards
        // against — clean it up first rather than working around it.
        createdUserIds.forEach(id -> userRepository.findById(id).ifPresent(user -> {
            gradeRepository.findByTeacherOrderByCreatedAtDesc(user).forEach(gradeRepository::delete);
            gradeRepository.findByStudentOrderBySemesterAscSubjectAsc(user).forEach(gradeRepository::delete);
        }));
        createdUserIds.forEach(userRepository::deleteById);
        createdUserIds.clear();
        createdProfileIds.clear();
    }

    @Test
    void demoTeacherCanReadTheirOwnGrades() throws Exception {
        Cookie cookie = login(DEMO_TEACHER_USERNAME, "10.20.0.1").getResponse().getCookie(AuthCookieService.COOKIE_NAME);

        mockMvc.perform(get("/api/teacher/grades").cookie(cookie))
                .andExpect(status().isOk());
    }

    @Test
    void demoTeacherCannotAddAGrade() throws Exception {
        MvcResult session = login(DEMO_TEACHER_USERNAME, "10.20.0.2");
        Cookie cookie = session.getResponse().getCookie(AuthCookieService.COOKIE_NAME);

        mockMvc.perform(post("/api/teacher/grades")
                        .cookie(cookie)
                        .header(AuthCookieService.CSRF_HEADER, csrfTokenOf(session))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"studentUsername\":\"" + DEMO_STUDENT_USERNAME
                                + "\",\"subject\":\"Тест\",\"semester\":1,\"grade\":6,\"gradeType\":\"REGULAR\"}"))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.message").value(org.hamcrest.Matchers.containsString(DEMO_MESSAGE_FRAGMENT)));
    }

    @Test
    void demoStudentCannotChangeTheirPassword() throws Exception {
        MvcResult session = login(DEMO_STUDENT_USERNAME, "10.20.0.3");
        Cookie cookie = session.getResponse().getCookie(AuthCookieService.COOKIE_NAME);

        mockMvc.perform(post("/api/auth/password")
                        .cookie(cookie)
                        .header(AuthCookieService.CSRF_HEADER, csrfTokenOf(session))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"currentPassword\":\"" + DEMO_PASSWORD + "\",\"newPassword\":\"Nova-Parola7\"}"))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.message").value(org.hamcrest.Matchers.containsString(DEMO_MESSAGE_FRAGMENT)));
    }

    @Test
    void demoAccountCanStillLogOut() throws Exception {
        MvcResult session = login(DEMO_STUDENT_USERNAME, "10.20.0.4");
        Cookie cookie = session.getResponse().getCookie(AuthCookieService.COOKIE_NAME);

        mockMvc.perform(post("/api/auth/logout")
                        .cookie(cookie)
                        .header(AuthCookieService.CSRF_HEADER, csrfTokenOf(session)))
                .andExpect(status().isNoContent());
    }

    @Test
    void demoTeacherRosterOnlyEverContainsTheDemoStudent() throws Exception {
        User realStudent = createStudent();
        Cookie cookie = login(DEMO_TEACHER_USERNAME, "10.20.0.5").getResponse().getCookie(AuthCookieService.COOKIE_NAME);

        mockMvc.perform(get("/api/teacher/students").cookie(cookie))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[?(@.studentUsername=='" + realStudent.getUsername() + "')]").isEmpty())
                .andExpect(jsonPath("$[?(@.studentUsername=='" + DEMO_STUDENT_USERNAME + "')]").isNotEmpty());
    }

    @Test
    void demoTeacherLookupCannotFindARealStudentByEmailOrFacultyNumber() throws Exception {
        User realStudent = createStudent();
        StudentProfile profile = new StudentProfile(realStudent);
        profile.setFacultyNumber("REAL" + UUID.randomUUID().toString().substring(0, 8).toUpperCase());
        profile = studentProfileRepository.save(profile);
        createdProfileIds.add(profile.getId());

        Cookie cookie = login(DEMO_TEACHER_USERNAME, "10.20.0.6").getResponse().getCookie(AuthCookieService.COOKIE_NAME);

        mockMvc.perform(get("/api/teacher/students/lookup").param("query", realStudent.getUsername()).cookie(cookie))
                .andExpect(status().isNotFound());
        mockMvc.perform(get("/api/teacher/students/lookup").param("query", profile.getFacultyNumber()).cookie(cookie))
                .andExpect(status().isNotFound());
    }

    @Test
    void aRealTeachersRosterAndWritesAreUnaffected() throws Exception {
        User realTeacher = createTeacher();
        User realStudent = createStudent();
        MvcResult session = login(realTeacher.getUsername(), "Silna-Parola1", "10.20.0.7");
        Cookie cookie = session.getResponse().getCookie(AuthCookieService.COOKIE_NAME);

        mockMvc.perform(get("/api/teacher/students").cookie(cookie))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[?(@.studentUsername=='" + realStudent.getUsername() + "')]").isNotEmpty());

        mockMvc.perform(post("/api/teacher/grades")
                        .cookie(cookie)
                        .header(AuthCookieService.CSRF_HEADER, csrfTokenOf(session))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"studentUsername\":\"" + realStudent.getUsername()
                                + "\",\"subject\":\"Тест\",\"semester\":1,\"grade\":6,\"gradeType\":\"REGULAR\"}"))
                .andExpect(status().isCreated());
    }

    @Test
    void repeatedFailedLoginsAgainstTheDemoAccountDoNotLockIt() throws Exception {
        for (int i = 0; i < LoginAttemptService.MAX_FAILED_ATTEMPTS; i++) {
            mockMvc.perform(loginRequest(DEMO_TEACHER_USERNAME, "wrong-password", "10.20.0.8"))
                    .andExpect(status().isUnauthorized());
        }

        // A non-demo account would be LOCKED at this point (see AuthSecurityTest); the
        // demo account's counter must never have moved.
        mockMvc.perform(loginRequest(DEMO_TEACHER_USERNAME, DEMO_PASSWORD, "10.20.0.8"))
                .andExpect(status().isOk());
    }

    /**
     * There is no seeded demo admin anywhere in this app (explicit product
     * decision — see documentation/decisions.md) and {@code
     * RestrictedDemoAccountSeeder} never creates one; this fixture exists
     * only in this test to prove the write-block in {@code
     * JwtAuthenticationFilter} is role-agnostic (keyed on {@code isDemo()},
     * not on which role the account has), not to suggest such an account is
     * ever expected in a real database.
     */
    @Test
    void theWriteBlockAppliesToAnyRoleNotJustTeacherAndStudent() throws Exception {
        String password = "Silna-Parola1";
        User adminDemo = userRepository.save(new User(
                "admin-demo-" + UUID.randomUUID() + "@example.com", passwordEncoder.encode(password), Role.ADMIN));
        adminDemo.setDemo(true);
        adminDemo = userRepository.save(adminDemo);
        createdUserIds.add(adminDemo.getId());

        User target = createStudent();

        MvcResult session = login(adminDemo.getUsername(), password, "10.20.0.9");
        Cookie cookie = session.getResponse().getCookie(AuthCookieService.COOKIE_NAME);

        mockMvc.perform(post("/api/admin/users/" + target.getId() + "/reset-password")
                        .cookie(cookie)
                        .header(AuthCookieService.CSRF_HEADER, csrfTokenOf(session))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"newPassword\":\"Druga-Parola2\"}"))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.message").value(org.hamcrest.Matchers.containsString(DEMO_MESSAGE_FRAGMENT)));
    }

    /**
     * The demo accounts are meant to always be available; deactivating one
     * via the admin panel must not stick. Runs the seeder's {@code run()}
     * directly rather than restarting the app, and restores the account to
     * enabled either way so this test can't leave the shared demo teacher
     * row disabled for a sibling test.
     */
    @Test
    void seederReactivatesADeactivatedDemoAccountOnItsNextRun() {
        User teacher = userRepository.findByUsernameIgnoreCase(DEMO_TEACHER_USERNAME).orElseThrow();
        teacher.setEnabled(false);
        userRepository.save(teacher);

        try {
            restrictedDemoAccountSeeder.run();

            User reloaded = userRepository.findByUsernameIgnoreCase(DEMO_TEACHER_USERNAME).orElseThrow();
            assertTrue(reloaded.isEnabled());
        } finally {
            userRepository.findByUsernameIgnoreCase(DEMO_TEACHER_USERNAME).ifPresent(u -> {
                u.setEnabled(true);
                userRepository.save(u);
            });
        }
    }

    private User createStudent() {
        User student = userRepository.save(new User(
                "student-" + UUID.randomUUID() + "@uni-sofia.bg",
                passwordEncoder.encode("Silna-Parola1"), Role.STUDENT));
        createdUserIds.add(student.getId());
        return student;
    }

    private User createTeacher() {
        User teacher = userRepository.save(new User(
                "teacher-" + UUID.randomUUID() + "@uni-sofia.bg",
                passwordEncoder.encode("Silna-Parola1"), Role.TEACHER));
        createdUserIds.add(teacher.getId());
        return teacher;
    }

    private MvcResult login(String username, String clientIp) throws Exception {
        return login(username, DEMO_PASSWORD, clientIp);
    }

    private MvcResult login(String username, String password, String clientIp) throws Exception {
        return mockMvc.perform(loginRequest(username, password, clientIp))
                .andExpect(status().isOk())
                .andReturn();
    }

    private org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder loginRequest(
            String username, String password, String clientIp) {
        return post("/api/auth/login")
                .header("X-Forwarded-For", clientIp)
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"username\":\"" + username + "\",\"password\":\"" + password + "\"}");
    }

    private String csrfTokenOf(MvcResult result) throws Exception {
        String body = result.getResponse().getContentAsString();
        return body.replaceAll(".*\"csrfToken\"\\s*:\\s*\"([^\"]+)\".*", "$1");
    }
}
