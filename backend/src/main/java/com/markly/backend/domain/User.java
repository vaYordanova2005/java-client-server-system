package com.markly.backend.domain;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.time.Instant;

@Entity
@Table(name = "users")
@Getter
@Setter
@NoArgsConstructor
public class User {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, unique = true)
    private String username;

    @Column(nullable = false)
    private String password;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private Role role;

    /** Cleared by an admin deactivation; see {@code /api/admin/users/{id}/status}. */
    @Column(nullable = false)
    private boolean enabled = true;

    /**
     * Set by {@code LoginAttemptService} after too many failed logins and
     * cleared once it passes, so a lockout expires on its own without an
     * admin having to intervene.
     */
    private Instant lockedUntil;

    @Column(nullable = false)
    private int failedLoginAttempts = 0;

    /**
     * Copied into every issued token and re-checked on every request. Bumping
     * it is what makes outstanding tokens stop working, since a JWT itself is
     * stateless and cannot be withdrawn.
     */
    @Column(nullable = false)
    private int tokenVersion = 0;

    /** Set only by {@code RestrictedDemoAccountSeeder}; every write is blocked for such an account. */
    @Column(name = "is_demo", nullable = false)
    private boolean demo = false;

    public User(String username, String password, Role role) {
        this.username = username;
        this.password = password;
        this.role = role;
    }
}
