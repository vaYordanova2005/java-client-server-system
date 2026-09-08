package com.markly.backend.domain;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.time.Instant;

/**
 * Canonical catalog entry for a subject name — additive alongside
 * {@link Grade#getSubject()}, which stays free text. Converting it to a
 * foreign key would mean reconciling every existing free-text value against
 * this catalog first (fuzzy matches, typos, casing), a real migration risk
 * for a column with live data; this catalog exists to answer "who teaches
 * what," which doesn't require that conversion.
 */
@Entity
@Table(name = "subjects")
@Getter
@Setter
@NoArgsConstructor
public class Subject {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false)
    private String name;

    private String faculty;

    private String specialty;

    /** Soft-delete flag — see V11's {@code UNIQUE(name, active)} for why this isn't a hard delete. */
    @Column(nullable = false)
    private boolean active = true;

    @Column(nullable = false, updatable = false)
    private Instant createdAt;

    public Subject(String name, String faculty, String specialty) {
        this.name = name;
        this.faculty = faculty;
        this.specialty = specialty;
    }

    @PrePersist
    void onCreate() {
        if (createdAt == null) {
            createdAt = Instant.now();
        }
    }
}
