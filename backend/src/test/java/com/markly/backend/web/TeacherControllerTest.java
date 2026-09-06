package com.markly.backend.web;

import com.markly.backend.domain.Grade;
import com.markly.backend.domain.Role;
import com.markly.backend.domain.StudentProfile;
import com.markly.backend.domain.User;
import com.markly.backend.repository.GradeRepository;
import com.markly.backend.repository.StudentProfileRepository;
import com.markly.backend.repository.UserRepository;
import com.markly.backend.security.AppUserPrincipal;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;

import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Mirrors {@link StudentControllerTest}: UUID-based usernames so fixtures
 * never collide across this suite's own tests (they share one H2 instance
 * for the whole run, {@code DB_CLOSE_DELAY=-1}), and manual cleanup in
 * {@link #tearDown()} rather than {@code @Transactional}, since a request
 * under test is served in its own persistence context and would not see
 * data still held in an uncommitted test transaction.
 */
@SpringBootTest
@AutoConfigureMockMvc
class TeacherControllerTest {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private UserRepository userRepository;

    @Autowired
    private GradeRepository gradeRepository;

    @Autowired
    private StudentProfileRepository studentProfileRepository;

    private final List<Long> createdUserIds = new ArrayList<>();
    private final List<Long> createdGradeIds = new ArrayList<>();
    private final List<Long> createdProfileIds = new ArrayList<>();

    private User teacher;
    private User otherTeacher;
    private User student;
    private String studentUsername;

    @BeforeEach
    void setUp() {
        teacher = save("teacher", Role.TEACHER);
        otherTeacher = save("other-teacher", Role.TEACHER);
        studentUsername = "student-" + UUID.randomUUID() + "@uni-sofia.bg";
        student = userRepository.save(new User(studentUsername, "{noop}irrelevant", Role.STUDENT));
        createdUserIds.add(student.getId());
    }

    @AfterEach
    void tearDown() {
        gradeRepository.deleteAllByIdInBatch(createdGradeIds);
        for (Long id : createdProfileIds) {
            studentProfileRepository.findById(id).ifPresent(studentProfileRepository::delete);
        }
        userRepository.deleteAllByIdInBatch(createdUserIds);
    }

    private User save(String prefix, Role role) {
        String username = prefix + "-" + UUID.randomUUID() + "@uni-sofia.bg";
        User saved = userRepository.save(new User(username, "{noop}irrelevant", role));
        createdUserIds.add(saved.getId());
        return saved;
    }

    private StudentProfile profileWithFacultyNumber(String facultyNumber) {
        StudentProfile profile = new StudentProfile(student);
        profile.setFacultyNumber(facultyNumber);
        profile.setFaculty("Факултет компютърни системи и технологии");
        profile.setSpecialty("Компютърно и софтуерно инженерство");
        profile.setGroupNumber("41");
        profile.setEnrolledSemester(3);
        StudentProfile saved = studentProfileRepository.save(profile);
        createdProfileIds.add(saved.getId());
        return saved;
    }

    private Grade saveGrade(User forTeacher, String subject, int semester, int grade) {
        Grade entity = gradeRepository.save(new Grade(student, forTeacher, subject, semester, grade));
        createdGradeIds.add(entity.getId());
        return entity;
    }

    // --- lookup ---

    @Test
    void lookupFindsAStudentByFacultyNumber() throws Exception {
        profileWithFacultyNumber("F12345");

        mockMvc.perform(get("/api/teacher/students/lookup")
                        .param("query", "f12345")
                        .with(user(new AppUserPrincipal(teacher))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.username").value(studentUsername))
                .andExpect(jsonPath("$.facultyNumber").value("F12345"))
                .andExpect(jsonPath("$.groupNumber").value("41"))
                .andExpect(jsonPath("$.admissionType").doesNotExist())
                .andExpect(jsonPath("$.status").doesNotExist())
                .andExpect(jsonPath("$.degreeLevel").doesNotExist());
    }

    @Test
    void lookupFindsAStudentByEmailWhenNoFacultyNumberMatches() throws Exception {
        mockMvc.perform(get("/api/teacher/students/lookup")
                        .param("query", studentUsername)
                        .with(user(new AppUserPrincipal(teacher))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.username").value(studentUsername))
                .andExpect(jsonPath("$.facultyNumber").doesNotExist());
    }

    @Test
    void lookupReturns404WhenNothingMatches() throws Exception {
        mockMvc.perform(get("/api/teacher/students/lookup")
                        .param("query", "no-such-thing-" + UUID.randomUUID())
                        .with(user(new AppUserPrincipal(teacher))))
                .andExpect(status().isNotFound());
    }

    @Test
    void teacherEndpointsRejectNonTeacherRolesWithForbidden() throws Exception {
        User admin = save("admin", Role.ADMIN);
        mockMvc.perform(get("/api/teacher/students/lookup")
                        .param("query", studentUsername)
                        .with(user(new AppUserPrincipal(admin))))
                .andExpect(status().isForbidden());
        mockMvc.perform(get("/api/teacher/students/lookup")
                        .param("query", studentUsername)
                        .with(user(new AppUserPrincipal(student))))
                .andExpect(status().isForbidden());
    }

    // --- own grades ---

    @Test
    void myGradesReturnsOnlyTheAuthenticatedTeachersGrades() throws Exception {
        saveGrade(teacher, "Програмиране", 1, 6);
        saveGrade(teacher, "Бази от данни", 2, 4);
        saveGrade(otherTeacher, "Обща физика", 1, 2);

        mockMvc.perform(get("/api/teacher/grades").with(user(new AppUserPrincipal(teacher))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(2))
                .andExpect(jsonPath("$[*].studentUsername", org.hamcrest.Matchers.everyItem(
                        org.hamcrest.Matchers.equalTo(studentUsername))));
    }

    // --- edit / delete ---

    @Test
    void updatesOwnGrade() throws Exception {
        Grade grade = saveGrade(teacher, "Програмиране", 1, 4);

        mockMvc.perform(put("/api/teacher/grades/" + grade.getId())
                        .with(user(new AppUserPrincipal(teacher)))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"subject\":\"Програмиране\",\"semester\":1,\"grade\":6}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.grade").value(6))
                .andExpect(jsonPath("$.studentUsername").value(studentUsername));
    }

    @Test
    void cannotUpdateAnotherTeachersGrade() throws Exception {
        Grade grade = saveGrade(otherTeacher, "Програмиране", 1, 4);

        mockMvc.perform(put("/api/teacher/grades/" + grade.getId())
                        .with(user(new AppUserPrincipal(teacher)))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"subject\":\"Програмиране\",\"semester\":1,\"grade\":6}"))
                .andExpect(status().isNotFound());
    }

    @Test
    void rejectsAnOutOfRangeGradeOnUpdate() throws Exception {
        Grade grade = saveGrade(teacher, "Програмиране", 1, 4);

        mockMvc.perform(put("/api/teacher/grades/" + grade.getId())
                        .with(user(new AppUserPrincipal(teacher)))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"subject\":\"Програмиране\",\"semester\":1,\"grade\":9}"))
                .andExpect(status().isBadRequest());
    }

    @Test
    void deletesOwnGrade() throws Exception {
        Grade grade = saveGrade(teacher, "Програмиране", 1, 4);

        mockMvc.perform(delete("/api/teacher/grades/" + grade.getId())
                        .with(user(new AppUserPrincipal(teacher))))
                .andExpect(status().isNoContent());

        createdGradeIds.remove(grade.getId());
        org.junit.jupiter.api.Assertions.assertTrue(gradeRepository.findById(grade.getId()).isEmpty());
    }

    @Test
    void cannotDeleteAnotherTeachersGrade() throws Exception {
        Grade grade = saveGrade(otherTeacher, "Програмиране", 1, 4);

        mockMvc.perform(delete("/api/teacher/grades/" + grade.getId())
                        .with(user(new AppUserPrincipal(teacher))))
                .andExpect(status().isNotFound());
    }
}
