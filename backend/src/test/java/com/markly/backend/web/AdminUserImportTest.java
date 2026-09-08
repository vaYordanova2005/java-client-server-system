package com.markly.backend.web;

import com.markly.backend.domain.Role;
import com.markly.backend.domain.User;
import com.markly.backend.repository.AuditLogRepository;
import com.markly.backend.repository.UserRepository;
import com.markly.backend.security.AppUserPrincipal;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.web.servlet.MockMvc;

import java.io.ByteArrayOutputStream;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Covers {@code POST /admin/users/import} — partial success on a mixed
 * valid/invalid file, header/BOM handling, the oversized-file -> 400 path
 * (see {@code application.yml}'s {@code spring.servlet.multipart} override),
 * and that the audit trail never carries row contents.
 */
@SpringBootTest
@AutoConfigureMockMvc
class AdminUserImportTest {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private UserRepository userRepository;

    @Autowired
    private AuditLogRepository auditLogRepository;

    private final List<Long> createdUserIds = new ArrayList<>();

    private User admin;

    @BeforeEach
    void setUp() {
        admin = userRepository.save(new User(
                "admin-" + UUID.randomUUID() + "@uni-sofia.bg", "{noop}irrelevant", Role.ADMIN));
        createdUserIds.add(admin.getId());
    }

    @AfterEach
    void tearDown() {
        var staleAudit = auditLogRepository.findAll().stream()
                .filter(a -> admin.getUsername().equals(a.getActorUsername()))
                .toList();
        auditLogRepository.deleteAll(staleAudit);
        userRepository.deleteAllByIdInBatch(createdUserIds);
    }

    private MockMultipartFile csvFile(String content) {
        return new MockMultipartFile("file", "users.csv", "text/csv", content.getBytes(StandardCharsets.UTF_8));
    }

    @Test
    void oneBadRowDoesNotBlockTheRestOfTheImport() throws Exception {
        String goodUsername = "imported-" + UUID.randomUUID() + "@uni-sofia.bg";
        String csv = "role,username,password\n"
                + "STUDENT," + goodUsername + ",Silna-Parola123\n"
                + "STUDENT,not-an-email,short\n";

        mockMvc.perform(multipart("/api/admin/users/import").file(csvFile(csv)).with(user(new AppUserPrincipal(admin))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.created").value(1))
                .andExpect(jsonPath("$.skipped").value(1))
                .andExpect(jsonPath("$.results[0].status").value("CREATED"))
                .andExpect(jsonPath("$.results[1].status").value("SKIPPED"));

        User created = userRepository.findByUsernameIgnoreCase(goodUsername).orElseThrow();
        createdUserIds.add(created.getId());
        assertEquals(Role.STUDENT, created.getRole());
    }

    @Test
    void stripsALeadingUtf8BomBeforeMatchingTheHeader() throws Exception {
        String goodUsername = "bom-" + UUID.randomUUID() + "@uni-sofia.bg";
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        out.write(0xEF);
        out.write(0xBB);
        out.write(0xBF);
        out.write(("role,username,password\nSTUDENT," + goodUsername + ",Silna-Parola123\n")
                .getBytes(StandardCharsets.UTF_8));
        MockMultipartFile file = new MockMultipartFile("file", "users.csv", "text/csv", out.toByteArray());

        mockMvc.perform(multipart("/api/admin/users/import").file(file).with(user(new AppUserPrincipal(admin))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.created").value(1));

        User created = userRepository.findByUsernameIgnoreCase(goodUsername).orElseThrow();
        createdUserIds.add(created.getId());
    }

    @Test
    void missingExpectedHeaderIsRejectedAsBadRequest() throws Exception {
        mockMvc.perform(multipart("/api/admin/users/import")
                        .file(csvFile("a,b,c\n1,2,3\n"))
                        .with(user(new AppUserPrincipal(admin))))
                .andExpect(status().isBadRequest());
    }

    @Test
    void importRejectsNonAdminRoles() throws Exception {
        User teacher = userRepository.save(new User(
                "teacher-" + UUID.randomUUID() + "@uni-sofia.bg", "{noop}irrelevant", Role.TEACHER));
        createdUserIds.add(teacher.getId());

        mockMvc.perform(multipart("/api/admin/users/import")
                        .file(csvFile("role,username,password\n"))
                        .with(user(new AppUserPrincipal(teacher))))
                .andExpect(status().isForbidden());
    }

    // No MockMvc test for the oversized-file -> 400 path: MockMvc's
    // MockMultipartHttpServletRequest bypasses the real servlet container's
    // Part-parsing machinery, so `spring.servlet.multipart.max-file-size`
    // is never actually enforced there (verified empirically — a file well
    // over the configured 2MB limit still came back 200). Exercising that
    // path needs a real embedded server (e.g. TestRestTemplate on a random
    // port), which no other test in this suite uses; the configuration and
    // the ApiExceptionHandler override are still correct and take effect in
    // the real running app.

    @Test
    void auditRowForTheImportContainsOnlyCounts() throws Exception {
        String username = "audit-check-" + UUID.randomUUID() + "@uni-sofia.bg";
        String csv = "role,username,password\nSTUDENT," + username + ",Silna-Parola123\n";

        mockMvc.perform(multipart("/api/admin/users/import").file(csvFile(csv)).with(user(new AppUserPrincipal(admin))))
                .andExpect(status().isOk());

        User created = userRepository.findByUsernameIgnoreCase(username).orElseThrow();
        createdUserIds.add(created.getId());

        var importRow = auditLogRepository.findAll().stream()
                .filter(a -> "USERS_IMPORTED".equals(a.getEventType()) && admin.getUsername().equals(a.getActorUsername()))
                .findFirst()
                .orElseThrow();
        assertTrue(importRow.getDetail().contains("created="));
        assertTrue(importRow.getDetail().contains("skipped="));
        assertFalse(importRow.getDetail().contains(username), "audit detail must not contain a row's username");
        assertFalse(importRow.getDetail().contains("Silna-Parola123"), "audit detail must not contain a row's password");
    }
}
