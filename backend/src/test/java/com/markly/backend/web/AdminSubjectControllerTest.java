package com.markly.backend.web;

import com.markly.backend.domain.Role;
import com.markly.backend.domain.Subject;
import com.markly.backend.domain.SubjectAssignment;
import com.markly.backend.domain.User;
import com.markly.backend.repository.SubjectAssignmentRepository;
import com.markly.backend.repository.SubjectRepository;
import com.markly.backend.repository.UserRepository;
import com.markly.backend.security.AppUserPrincipal;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;

import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Covers {@code /admin/subjects} CRUD and {@code /admin/subjects/{id}/assignments}
 * — same UUID-username-and-manual-cleanup pattern as {@link TeacherControllerTest}.
 * Assignment cleanup runs before subject cleanup to respect the FK.
 */
@SpringBootTest
@AutoConfigureMockMvc
class AdminSubjectControllerTest {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private UserRepository userRepository;

    @Autowired
    private SubjectRepository subjectRepository;

    @Autowired
    private SubjectAssignmentRepository subjectAssignmentRepository;

    private final List<Long> createdUserIds = new ArrayList<>();
    private final List<Long> createdSubjectIds = new ArrayList<>();
    private final List<Long> createdAssignmentIds = new ArrayList<>();

    private User admin;
    private User teacher;

    @BeforeEach
    void setUp() {
        admin = save("admin", Role.ADMIN);
        teacher = save("teacher", Role.TEACHER);
    }

    @AfterEach
    void tearDown() {
        for (Long id : createdAssignmentIds) {
            subjectAssignmentRepository.findById(id).ifPresent(subjectAssignmentRepository::delete);
        }
        for (Long id : createdSubjectIds) {
            subjectRepository.findById(id).ifPresent(subjectRepository::delete);
        }
        userRepository.deleteAllByIdInBatch(createdUserIds);
    }

    private User save(String prefix, Role role) {
        String username = prefix + "-" + UUID.randomUUID() + "@uni-sofia.bg";
        User saved = userRepository.save(new User(username, "{noop}irrelevant", role));
        createdUserIds.add(saved.getId());
        return saved;
    }

    private Subject saveSubject(String name, boolean active) {
        Subject subject = new Subject(name, "Факултет по математика и информатика", "Информатика");
        subject.setActive(active);
        Subject saved = subjectRepository.save(subject);
        createdSubjectIds.add(saved.getId());
        return saved;
    }

    private String uniqueName() {
        return "Програмиране-" + UUID.randomUUID();
    }

    // --- subject CRUD ---

    @Test
    void createsUpdatesAndSoftDeletesASubject() throws Exception {
        String name = uniqueName();

        String createResponse = mockMvc.perform(post("/api/admin/subjects")
                        .with(user(new AppUserPrincipal(admin)))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\":\"" + name + "\",\"faculty\":\"ФМИ\",\"specialty\":\"Информатика\"}"))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.name").value(name))
                .andExpect(jsonPath("$.active").value(true))
                .andReturn().getResponse().getContentAsString();
        Long id = Long.valueOf(createResponse.replaceAll(".*\"id\":(\\d+).*", "$1"));
        createdSubjectIds.add(id);

        mockMvc.perform(put("/api/admin/subjects/" + id)
                        .with(user(new AppUserPrincipal(admin)))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\":\"" + name + "\",\"faculty\":\"ФМИ 2\",\"specialty\":\"Информатика\",\"active\":true}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.faculty").value("ФМИ 2"));

        mockMvc.perform(delete("/api/admin/subjects/" + id).with(user(new AppUserPrincipal(admin))))
                .andExpect(status().isNoContent());

        mockMvc.perform(get("/api/admin/subjects").with(user(new AppUserPrincipal(admin))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[?(@.id == " + id + ")].active").value(org.hamcrest.Matchers.contains(false)));
    }

    // --- hard delete ---

    @Test
    void hardDeleteRemovesASubjectWithNoAssignments() throws Exception {
        Subject subject = saveSubject(uniqueName(), true);

        mockMvc.perform(delete("/api/admin/subjects/" + subject.getId() + "/permanent")
                        .with(user(new AppUserPrincipal(admin))))
                .andExpect(status().isNoContent());
        createdSubjectIds.remove(subject.getId());

        assertTrue(subjectRepository.findById(subject.getId()).isEmpty());
    }

    @Test
    void hardDeleteIsBlockedWithConflictWhenAssignmentsExist() throws Exception {
        Subject subject = saveSubject(uniqueName(), true);
        SubjectAssignment assignment = subjectAssignmentRepository.save(new SubjectAssignment(subject, teacher, null));
        createdAssignmentIds.add(assignment.getId());

        mockMvc.perform(delete("/api/admin/subjects/" + subject.getId() + "/permanent")
                        .with(user(new AppUserPrincipal(admin))))
                .andExpect(status().isConflict());

        assertTrue(subjectRepository.findById(subject.getId()).isPresent());
    }

    // --- reactivation flow ---

    @Test
    void creatingASubjectCollidingWithAnInactiveOneReturns409WithReactivationInfo() throws Exception {
        String name = uniqueName();
        Subject inactive = saveSubject(name, false);

        mockMvc.perform(post("/api/admin/subjects")
                        .with(user(new AppUserPrincipal(admin)))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\":\"" + name + "\"}"))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.message", org.hamcrest.Matchers.containsString(String.valueOf(inactive.getId()))));
    }

    @Test
    void renamingASubjectToCollideWithAnInactiveOneReturns409() throws Exception {
        String collidingName = uniqueName();
        saveSubject(collidingName, false);
        Subject toRename = saveSubject(uniqueName(), true);

        mockMvc.perform(put("/api/admin/subjects/" + toRename.getId())
                        .with(user(new AppUserPrincipal(admin)))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\":\"" + collidingName + "\",\"active\":true}"))
                .andExpect(status().isConflict());
    }

    @Test
    void reactivatingViaPutRestoresVisibilityAsActive() throws Exception {
        String name = uniqueName();
        Subject inactive = saveSubject(name, false);

        mockMvc.perform(put("/api/admin/subjects/" + inactive.getId())
                        .with(user(new AppUserPrincipal(admin)))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\":\"" + name + "\",\"active\":true}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.active").value(true));
    }

    @Test
    void renamingASubjectToItsOwnCurrentNameIsAllowed() throws Exception {
        Subject subject = saveSubject(uniqueName(), true);

        mockMvc.perform(put("/api/admin/subjects/" + subject.getId())
                        .with(user(new AppUserPrincipal(admin)))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\":\"" + subject.getName() + "\",\"faculty\":\"Ново\",\"active\":true}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.faculty").value("Ново"));
    }

    // --- assignments ---

    @Test
    void createsAndDeletesAnAssignment() throws Exception {
        Subject subject = saveSubject(uniqueName(), true);

        String response = mockMvc.perform(post("/api/admin/subjects/" + subject.getId() + "/assignments")
                        .with(user(new AppUserPrincipal(admin)))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"teacherUsername\":\"" + teacher.getUsername() + "\",\"groupNumber\":\"41\"}"))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.teacherUsername").value(teacher.getUsername()))
                .andExpect(jsonPath("$.groupNumber").value("41"))
                .andReturn().getResponse().getContentAsString();
        Long assignmentId = Long.valueOf(response.replaceAll(".*\"id\":(\\d+).*", "$1"));
        createdAssignmentIds.add(assignmentId);

        mockMvc.perform(get("/api/admin/subjects/" + subject.getId() + "/assignments")
                        .with(user(new AppUserPrincipal(admin))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(1));

        mockMvc.perform(delete("/api/admin/subjects/assignments/" + assignmentId)
                        .with(user(new AppUserPrincipal(admin))))
                .andExpect(status().isNoContent());
        createdAssignmentIds.remove(assignmentId);

        assertTrue(subjectAssignmentRepository.findById(assignmentId).isEmpty());
    }

    @Test
    void duplicateAssignmentForTheSameTeacherAndNoGroupIsRejected() throws Exception {
        Subject subject = saveSubject(uniqueName(), true);
        SubjectAssignment existing = subjectAssignmentRepository.save(new SubjectAssignment(subject, teacher, null));
        createdAssignmentIds.add(existing.getId());

        mockMvc.perform(post("/api/admin/subjects/" + subject.getId() + "/assignments")
                        .with(user(new AppUserPrincipal(admin)))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"teacherUsername\":\"" + teacher.getUsername() + "\"}"))
                .andExpect(status().isBadRequest());
    }

    // --- authorization ---

    @Test
    void subjectEndpointsRejectNonAdminRoles() throws Exception {
        mockMvc.perform(get("/api/admin/subjects").with(user(new AppUserPrincipal(teacher))))
                .andExpect(status().isForbidden());
        mockMvc.perform(post("/api/admin/subjects")
                        .with(user(new AppUserPrincipal(teacher)))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\":\"X\"}"))
                .andExpect(status().isForbidden());
    }
}
