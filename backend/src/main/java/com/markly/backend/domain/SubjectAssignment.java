package com.markly.backend.domain;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

/**
 * Which teacher(s) teach a {@link Subject}, optionally scoped to a group.
 * {@code groupNumber} uses the empty-string sentinel {@code ""} for a
 * subject-wide (non-group-scoped) assignment — never {@code null}, see V11.
 */
@Entity
@Table(name = "subject_teacher_assignments")
@Getter
@Setter
@NoArgsConstructor
public class SubjectAssignment {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "subject_id", nullable = false)
    private Subject subject;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "teacher_id", nullable = false)
    private User teacher;

    @Column(name = "group_number", nullable = false)
    private String groupNumber = "";

    public SubjectAssignment(Subject subject, User teacher, String groupNumber) {
        this.subject = subject;
        this.teacher = teacher;
        this.groupNumber = groupNumber == null ? "" : groupNumber;
    }
}
