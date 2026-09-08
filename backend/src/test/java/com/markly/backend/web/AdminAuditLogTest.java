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
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;

import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Covers {@code GET /admin/audit-log} and the two existing admin actions
 * that already fed the old SLF4J-only logger ({@code ACCOUNT_STATUS_CHANGED},
 * {@code ACCOUNT_UNLOCKED}), now persisted through {@code AuditLogService}.
 * Cleanup queries by username rather than tracking ids up front, since the
 * rows are created as a side effect of the controller calls under test, not
 * written directly by this class.
 */
@SpringBootTest
@AutoConfigureMockMvc
class AdminAuditLogTest {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private UserRepository userRepository;

    @Autowired
    private AuditLogRepository auditLogRepository;

    private final List<Long> createdUserIds = new ArrayList<>();

    private User admin;
    private User target;

    @BeforeEach
    void setUp() {
        admin = save("admin", Role.ADMIN);
        target = save("target", Role.STUDENT);
    }

    @AfterEach
    void tearDown() {
        var stale = auditLogRepository.findAll().stream()
                .filter(a -> admin.getUsername().equals(a.getActorUsername())
                        || target.getUsername().equals(a.getTargetUsername())
                        || target.getUsername().equals(a.getActorUsername()))
                .toList();
        auditLogRepository.deleteAll(stale);
        userRepository.deleteAllByIdInBatch(createdUserIds);
    }

    private User save(String prefix, Role role) {
        String username = prefix + "-" + UUID.randomUUID() + "@uni-sofia.bg";
        User saved = userRepository.save(new User(username, "{noop}irrelevant", role));
        createdUserIds.add(saved.getId());
        return saved;
    }

    @Test
    void deactivatingAUserRecordsAnAuditRowWithDistinctActorAndTarget() throws Exception {
        mockMvc.perform(put("/api/admin/users/" + target.getId() + "/status")
                        .with(user(new AppUserPrincipal(admin)))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"enabled\":false}"))
                .andExpect(status().isOk());

        mockMvc.perform(get("/api/admin/audit-log")
                        .param("targetUsername", target.getUsername())
                        .with(user(new AppUserPrincipal(admin))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.content[0].eventType").value("ACCOUNT_STATUS_CHANGED"))
                .andExpect(jsonPath("$.content[0].actorUsername").value(admin.getUsername()))
                .andExpect(jsonPath("$.content[0].targetUsername").value(target.getUsername()));
    }

    @Test
    void unlockingAUserRecordsAnAuditRow() throws Exception {
        mockMvc.perform(post("/api/admin/users/" + target.getId() + "/unlock")
                        .with(user(new AppUserPrincipal(admin))))
                .andExpect(status().isOk());

        mockMvc.perform(get("/api/admin/audit-log")
                        .param("eventType", "ACCOUNT_UNLOCKED")
                        .param("targetUsername", target.getUsername())
                        .with(user(new AppUserPrincipal(admin))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.totalElements").value(1));
    }

    @Test
    void involvingMatchesEitherActorOrTarget() throws Exception {
        mockMvc.perform(post("/api/admin/users/" + target.getId() + "/unlock")
                        .with(user(new AppUserPrincipal(admin))))
                .andExpect(status().isOk());

        // `admin` is the actor, not the target, of this event — a plain
        // targetUsername filter would miss it, which is exactly why
        // `involving` exists.
        mockMvc.perform(get("/api/admin/audit-log")
                        .param("involving", admin.getUsername())
                        .with(user(new AppUserPrincipal(admin))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.content[0].actorUsername").value(admin.getUsername()));
    }

    @Test
    void auditLogEndpointRejectsNonAdminRoles() throws Exception {
        mockMvc.perform(get("/api/admin/audit-log").with(user(new AppUserPrincipal(target))))
                .andExpect(status().isForbidden());
    }
}
