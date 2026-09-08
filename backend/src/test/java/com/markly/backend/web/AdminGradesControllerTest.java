package com.markly.backend.web;

import com.markly.backend.domain.Grade;
import com.markly.backend.domain.GradeType;
import com.markly.backend.domain.Role;
import com.markly.backend.domain.User;
import com.markly.backend.repository.GradeRepository;
import com.markly.backend.repository.UserRepository;
import com.markly.backend.security.AppUserPrincipal;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.test.web.servlet.MockMvc;

import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

import static org.hamcrest.Matchers.greaterThanOrEqualTo;
import static org.hamcrest.Matchers.hasItem;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Covers the admin's system-wide read views ({@code GET /admin/grades},
 * {@code GET /admin/students}) — same UUID-username-and-manual-cleanup
 * pattern as {@link TeacherControllerTest}.
 */
@SpringBootTest
@AutoConfigureMockMvc
class AdminGradesControllerTest {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private UserRepository userRepository;

    @Autowired
    private GradeRepository gradeRepository;

    private final List<Long> createdUserIds = new ArrayList<>();
    private final List<Long> createdGradeIds = new ArrayList<>();

    private User admin;
    private User teacherA;
    private User teacherB;
    private User student;

    @BeforeEach
    void setUp() {
        admin = save("admin", Role.ADMIN);
        teacherA = save("teacher-a", Role.TEACHER);
        teacherB = save("teacher-b", Role.TEACHER);
        student = save("student", Role.STUDENT);
    }

    @AfterEach
    void tearDown() {
        gradeRepository.deleteAllByIdInBatch(createdGradeIds);
        userRepository.deleteAllByIdInBatch(createdUserIds);
    }

    private User save(String prefix, Role role) {
        String username = prefix + "-" + UUID.randomUUID() + "@uni-sofia.bg";
        User saved = userRepository.save(new User(username, "{noop}irrelevant", role));
        createdUserIds.add(saved.getId());
        return saved;
    }

    private Grade saveGrade(User forStudent, User forTeacher, String subject, int semester, int grade) {
        Grade entity = gradeRepository.save(new Grade(forStudent, forTeacher, subject, semester, grade, GradeType.REGULAR));
        createdGradeIds.add(entity.getId());
        return entity;
    }

    @Test
    void allGradesIncludesGradesFromEveryTeacher() throws Exception {
        saveGrade(student, teacherA, "Програмиране", 1, 6);
        saveGrade(student, teacherB, "Обща физика", 1, 4);

        mockMvc.perform(get("/api/admin/grades").param("size", "1000").with(user(new AppUserPrincipal(admin))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.content[*].teacherUsername",
                        hasItem(teacherA.getUsername())))
                .andExpect(jsonPath("$.content[*].teacherUsername",
                        hasItem(teacherB.getUsername())));
    }

    @Test
    void allGradesCarriesTheTeacherUsername() throws Exception {
        Grade grade = saveGrade(student, teacherA, "Програмиране", 1, 6);

        mockMvc.perform(get("/api/admin/grades").param("size", "1000").with(user(new AppUserPrincipal(admin))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.content[?(@.id == " + grade.getId() + ")].teacherUsername",
                        hasItem(teacherA.getUsername())))
                .andExpect(jsonPath("$.content[?(@.id == " + grade.getId() + ")].studentUsername",
                        hasItem(student.getUsername())));
    }

    @Test
    void allGradesIsPaginated() throws Exception {
        saveGrade(student, teacherA, "Програмиране", 1, 6);
        saveGrade(student, teacherB, "Обща физика", 1, 4);

        mockMvc.perform(get("/api/admin/grades").param("page", "0").param("size", "1").with(user(new AppUserPrincipal(admin))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.content.length()").value(1))
                .andExpect(jsonPath("$.size").value(1))
                .andExpect(jsonPath("$.totalElements", greaterThanOrEqualTo(2)));
    }

    @Test
    void allStudentsIncludesStudentsWithNoGrades() throws Exception {
        mockMvc.perform(get("/api/admin/students").with(user(new AppUserPrincipal(admin))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[*].studentUsername", hasItem(student.getUsername())));
    }

    @Test
    void adminGradeEndpointsRejectNonAdminRoles() throws Exception {
        mockMvc.perform(get("/api/admin/grades").with(user(new AppUserPrincipal(teacherA))))
                .andExpect(status().isForbidden());
        mockMvc.perform(get("/api/admin/students").with(user(new AppUserPrincipal(student))))
                .andExpect(status().isForbidden());
    }
}
