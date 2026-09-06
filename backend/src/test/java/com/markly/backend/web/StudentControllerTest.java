package com.markly.backend.web;

import com.markly.backend.domain.Grade;
import com.markly.backend.domain.GradeType;
import com.markly.backend.domain.Role;
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
import org.springframework.test.web.servlet.MockMvc;

import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

import static org.hamcrest.Matchers.hasItem;
import static org.hamcrest.Matchers.not;
import static org.hamcrest.Matchers.nullValue;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * The whole point of {@code /api/student/grades} is that it answers for the
 * authenticated student and nobody else — it takes no student parameter, so a
 * regression here would be a silent leak of one student's grades into another
 * student's journal rather than a visible error.
 *
 * <p>Deliberately not {@code @Transactional}: the request is served in its own
 * persistence context and would not see data still held in an uncommitted test
 * transaction. Fixtures are therefore committed — and, since the H2 instance
 * backing the test suite stays alive for the whole run ({@code DB_CLOSE_DELAY=-1}),
 * explicitly deleted again in {@link #tearDown()} so they don't linger for
 * whatever test class runs next (e.g. one that lists/counts all users).
 * {@link UUID}-based usernames additionally guard against collisions between
 * this class's own tests, which all run against the same shared database.
 */
@SpringBootTest
@AutoConfigureMockMvc
class StudentControllerTest {

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

    private User student;
    private User otherStudent;

    @BeforeEach
    void setUp() {
        User teacher = save("teacher", Role.TEACHER);
        student = save("student", Role.STUDENT);
        otherStudent = save("other", Role.STUDENT);

        saveGrade(new Grade(student, teacher, "Програмиране", 1, 6, GradeType.REGULAR));
        saveGrade(new Grade(student, teacher, "Бази от данни", 2, 4, GradeType.REGULAR));
        saveGrade(new Grade(otherStudent, teacher, "Обща физика", 1, 2, GradeType.REGULAR));
    }

    @AfterEach
    void tearDown() {
        // Grades and profiles reference student_id/teacher_id, so they have to
        // go before the users they point at.
        gradeRepository.deleteAllByIdInBatch(createdGradeIds);
        studentProfileRepository.findByStudent(student).ifPresent(studentProfileRepository::delete);
        userRepository.deleteAllByIdInBatch(createdUserIds);
    }

    private User save(String prefix, Role role) {
        String username = prefix + "-" + UUID.randomUUID() + "@uni-sofia.bg";
        User saved = userRepository.save(new User(username, "{noop}irrelevant", role));
        createdUserIds.add(saved.getId());
        return saved;
    }

    private void saveGrade(Grade grade) {
        createdGradeIds.add(gradeRepository.save(grade).getId());
    }

    @Test
    void returnsOnlyTheAuthenticatedStudentsGrades() throws Exception {
        mockMvc.perform(get("/api/student/grades").with(user(new AppUserPrincipal(student))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(2))
                .andExpect(jsonPath("$[0].subject").value("Програмиране"))
                .andExpect(jsonPath("$[0].semester").value(1))
                .andExpect(jsonPath("$[1].subject").value("Бази от данни"))
                .andExpect(jsonPath("$[*].subject", not(hasItem("Обща физика"))));
    }

    @Test
    void answersTheOtherStudentWithTheirOwnGradesOnly() throws Exception {
        mockMvc.perform(get("/api/student/grades").with(user(new AppUserPrincipal(otherStudent))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(1))
                .andExpect(jsonPath("$[0].subject").value("Обща физика"));
    }

    @Test
    void rejectsAnUnauthenticatedRequest() throws Exception {
        mockMvc.perform(get("/api/student/grades"))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void rejectsANonStudentRole() throws Exception {
        User teacher = save("teacher2", Role.TEACHER);
        mockMvc.perform(get("/api/student/grades").with(user(new AppUserPrincipal(teacher))))
                .andExpect(status().isForbidden());
    }

    @Test
    void profileFallsBackToAnEmptyRecordWhenTheStudentHasNoProfile() throws Exception {
        studentProfileRepository.findByStudent(student).ifPresent(studentProfileRepository::delete);

        mockMvc.perform(get("/api/student/profile").with(user(new AppUserPrincipal(student))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.studentUsername").value(student.getUsername()))
                .andExpect(jsonPath("$.enrolledSemester", nullValue()));
    }
}
