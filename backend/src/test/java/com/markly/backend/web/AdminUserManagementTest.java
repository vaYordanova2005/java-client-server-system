package com.markly.backend.web;

import com.markly.backend.domain.CalendarEvent;
import com.markly.backend.domain.CalendarEventType;
import com.markly.backend.domain.Grade;
import com.markly.backend.domain.GradeType;
import com.markly.backend.domain.Role;
import com.markly.backend.domain.StudentProfile;
import com.markly.backend.domain.Subject;
import com.markly.backend.domain.SubjectAssignment;
import com.markly.backend.domain.User;
import com.markly.backend.repository.CalendarEventRepository;
import com.markly.backend.repository.GradeRepository;
import com.markly.backend.repository.StudentProfileRepository;
import com.markly.backend.repository.SubjectAssignmentRepository;
import com.markly.backend.repository.SubjectRepository;
import com.markly.backend.repository.UserRepository;
import com.markly.backend.security.AppUserPrincipal;
import com.markly.backend.security.AuthCookieService;
import jakarta.servlet.http.Cookie;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;

import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Covers {@code DELETE /admin/users/{id}} and
 * {@code POST /admin/users/{id}/reset-password} — same UUID-username and
 * manual-cleanup pattern as {@link TeacherControllerTest}. Grade/calendar
 * fixtures are cleaned up before the user rows they reference, matching the
 * FK order the delete guards exist to protect.
 */
@SpringBootTest
@AutoConfigureMockMvc
class AdminUserManagementTest {

    private static final String PASSWORD = "Silna-Parola1";

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private UserRepository userRepository;

    @Autowired
    private GradeRepository gradeRepository;

    @Autowired
    private StudentProfileRepository studentProfileRepository;

    @Autowired
    private CalendarEventRepository calendarEventRepository;

    @Autowired
    private SubjectRepository subjectRepository;

    @Autowired
    private SubjectAssignmentRepository subjectAssignmentRepository;

    @Autowired
    private PasswordEncoder passwordEncoder;

    private final List<Long> createdUserIds = new ArrayList<>();
    private final List<Long> createdGradeIds = new ArrayList<>();
    private final List<Long> createdProfileIds = new ArrayList<>();
    private final List<Long> createdEventIds = new ArrayList<>();
    private final List<Long> createdAssignmentIds = new ArrayList<>();
    private final List<Long> createdSubjectIds = new ArrayList<>();

    private User admin;

    @BeforeEach
    void setUp() {
        admin = save("admin", Role.ADMIN);
    }

    @AfterEach
    void tearDown() {
        subjectAssignmentRepository.deleteAllByIdInBatch(createdAssignmentIds);
        subjectRepository.deleteAllByIdInBatch(createdSubjectIds);
        calendarEventRepository.deleteAllByIdInBatch(createdEventIds);
        gradeRepository.deleteAllByIdInBatch(createdGradeIds);
        for (Long id : createdProfileIds) {
            studentProfileRepository.findById(id).ifPresent(studentProfileRepository::delete);
        }
        userRepository.deleteAllByIdInBatch(createdUserIds);
    }

    private User save(String prefix, Role role) {
        String username = prefix + "-" + UUID.randomUUID() + "@uni-sofia.bg";
        User saved = userRepository.save(new User(username, passwordEncoder.encode(PASSWORD), role));
        createdUserIds.add(saved.getId());
        return saved;
    }

    // --- list (paginated) ---

    @Test
    void listUsersIsPaginated() throws Exception {
        save("student", Role.STUDENT);
        save("student", Role.STUDENT);

        mockMvc.perform(get("/api/admin/users").param("page", "0").param("size", "1")
                        .with(user(new AppUserPrincipal(admin))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.content.length()").value(1))
                .andExpect(jsonPath("$.size").value(1))
                .andExpect(jsonPath("$.totalElements", org.hamcrest.Matchers.greaterThanOrEqualTo(3)));
    }

    @Test
    void listUsersRejectsNonAdminRoles() throws Exception {
        User teacher = save("teacher", Role.TEACHER);
        mockMvc.perform(get("/api/admin/users").with(user(new AppUserPrincipal(teacher))))
                .andExpect(status().isForbidden());
    }

    // --- delete ---

    @Test
    void deletingAStudentWithNoHistoryRemovesThemAndFreesTheirFacultyNumber() throws Exception {
        User student = save("student", Role.STUDENT);
        StudentProfile profile = new StudentProfile(student);
        profile.setFacultyNumber("F55501");
        StudentProfile saved = studentProfileRepository.save(profile);
        createdProfileIds.add(saved.getId());

        mockMvc.perform(delete("/api/admin/users/" + student.getId()).with(user(new AppUserPrincipal(admin))))
                .andExpect(status().isOk());
        createdUserIds.remove(student.getId());
        createdProfileIds.remove(saved.getId());

        assertTrue(userRepository.findById(student.getId()).isEmpty());
        assertTrue(studentProfileRepository.findById(saved.getId()).isEmpty());
        assertFalse(studentProfileRepository.existsByFacultyNumberAndStudentNot("F55501", admin));
    }

    @Test
    void deletingAStudentWithGradesIsBlockedWithConflict() throws Exception {
        User teacher = save("teacher", Role.TEACHER);
        User student = save("student", Role.STUDENT);
        Grade grade = gradeRepository.save(new Grade(student, teacher, "Програмиране", 1, 5, GradeType.REGULAR));
        createdGradeIds.add(grade.getId());

        mockMvc.perform(delete("/api/admin/users/" + student.getId()).with(user(new AppUserPrincipal(admin))))
                .andExpect(status().isConflict());
        assertTrue(userRepository.findById(student.getId()).isPresent());
    }

    @Test
    void deletingATeacherWithGradesIsBlockedWithConflict() throws Exception {
        User teacher = save("teacher", Role.TEACHER);
        User student = save("student", Role.STUDENT);
        Grade grade = gradeRepository.save(new Grade(student, teacher, "Програмиране", 1, 5, GradeType.REGULAR));
        createdGradeIds.add(grade.getId());

        mockMvc.perform(delete("/api/admin/users/" + teacher.getId()).with(user(new AppUserPrincipal(admin))))
                .andExpect(status().isConflict());
        assertTrue(userRepository.findById(teacher.getId()).isPresent());
    }

    @Test
    void deletingAUserWhoAuthoredACalendarEventIsBlockedWithConflict() throws Exception {
        User teacher = save("teacher", Role.TEACHER);
        CalendarEvent event = calendarEventRepository.save(new CalendarEvent(
                CalendarEventType.EVENT, "Ден на отворените врати", null, null, LocalDate.now(), null, teacher));
        createdEventIds.add(event.getId());

        mockMvc.perform(delete("/api/admin/users/" + teacher.getId()).with(user(new AppUserPrincipal(admin))))
                .andExpect(status().isConflict());
        assertTrue(userRepository.findById(teacher.getId()).isPresent());
    }

    @Test
    void deletingATeacherAssignedToASubjectIsBlockedWithConflict() throws Exception {
        User teacher = save("teacher", Role.TEACHER);
        Subject subject = subjectRepository.save(new Subject("Предмет-" + UUID.randomUUID(), null, null));
        createdSubjectIds.add(subject.getId());
        SubjectAssignment assignment =
                subjectAssignmentRepository.save(new SubjectAssignment(subject, teacher, ""));
        createdAssignmentIds.add(assignment.getId());

        mockMvc.perform(delete("/api/admin/users/" + teacher.getId()).with(user(new AppUserPrincipal(admin))))
                .andExpect(status().isConflict());
        assertTrue(userRepository.findById(teacher.getId()).isPresent());
    }

    @Test
    void cannotDeleteOwnAccount() throws Exception {
        mockMvc.perform(delete("/api/admin/users/" + admin.getId()).with(user(new AppUserPrincipal(admin))))
                .andExpect(status().isBadRequest());
    }

    @Test
    void deleteRejectsNonAdminRoles() throws Exception {
        User teacher = save("teacher", Role.TEACHER);
        User student = save("student", Role.STUDENT);
        mockMvc.perform(delete("/api/admin/users/" + student.getId()).with(user(new AppUserPrincipal(teacher))))
                .andExpect(status().isForbidden());
    }

    // --- reset password ---

    @Test
    void resetPasswordInvalidatesTheOldSessionButAllowsLoginWithTheNewOne() throws Exception {
        User target = save("target", Role.STUDENT);

        MvcResult loginResult = mockMvc.perform(post("/api/auth/login")
                        .header("X-Forwarded-For", "10.1.0.1")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"username\":\"" + target.getUsername() + "\",\"password\":\"" + PASSWORD + "\"}"))
                .andExpect(status().isOk())
                .andReturn();
        Cookie oldSession = loginResult.getResponse().getCookie(AuthCookieService.COOKIE_NAME);

        mockMvc.perform(post("/api/admin/users/" + target.getId() + "/reset-password")
                        .with(user(new AppUserPrincipal(admin)))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"newPassword\":\"Nova-Silna-Parola9\"}"))
                .andExpect(status().isOk());

        mockMvc.perform(get("/api/auth/me").cookie(oldSession))
                .andExpect(status().isUnauthorized());

        mockMvc.perform(post("/api/auth/login")
                        .header("X-Forwarded-For", "10.1.0.1")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"username\":\"" + target.getUsername() + "\",\"password\":\"Nova-Silna-Parola9\"}"))
                .andExpect(status().isOk());
    }

    @Test
    void resetPasswordRejectsAWeakPassword() throws Exception {
        User target = save("target", Role.STUDENT);

        mockMvc.perform(post("/api/admin/users/" + target.getId() + "/reset-password")
                        .with(user(new AppUserPrincipal(admin)))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"newPassword\":\"kratka1\"}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").isNotEmpty());
    }

    @Test
    void resetPasswordRejectsNonAdminRoles() throws Exception {
        User teacher = save("teacher", Role.TEACHER);
        User target = save("target", Role.STUDENT);

        mockMvc.perform(post("/api/admin/users/" + target.getId() + "/reset-password")
                        .with(user(new AppUserPrincipal(teacher)))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"newPassword\":\"Nova-Silna-Parola9\"}"))
                .andExpect(status().isForbidden());
    }
}
