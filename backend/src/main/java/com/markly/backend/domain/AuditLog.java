package com.markly.backend.domain;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.time.Instant;

/**
 * Deliberately has no relation to {@link User} — see {@code V10} — so a
 * hard-deleted account's own history survives the delete instead of being
 * cascade-deleted or orphaned.
 */
@Entity
@Table(name = "audit_log")
@Getter
@Setter
@NoArgsConstructor
public class AuditLog {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "event_type", nullable = false, length = 40)
    private String eventType;

    @Column(name = "actor_username")
    private String actorUsername;

    @Column(name = "target_username")
    private String targetUsername;

    private String ip;

    @Column(columnDefinition = "text")
    private String detail;

    @Column(nullable = false, updatable = false)
    private Instant createdAt;

    public AuditLog(String eventType, String actorUsername, String targetUsername, String ip, String detail) {
        this.eventType = eventType;
        this.actorUsername = actorUsername;
        this.targetUsername = targetUsername;
        this.ip = ip;
        this.detail = detail;
    }

    @PrePersist
    void onCreate() {
        if (createdAt == null) {
            createdAt = Instant.now();
        }
    }
}
