package com.markly.backend.domain;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.time.Instant;

@Entity
@Table(name = "grades")
@Getter
@Setter
@NoArgsConstructor
public class Grade {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "student_id", nullable = false)
    private User student;

    /**
     * Every grade created through the application has a teacher, so this is
     * mapped as mandatory. The underlying column is deliberately nullable
     * (see V2/V3) to tolerate legacy rows that predate the column and could
     * not be attributed to anyone: for such a row this field reads back as
     * {@code null} despite {@code optional = false}, so any future code that
     * surfaces "who entered this grade" must null-check rather than assume.
     */
    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "teacher_id", nullable = false)
    private User teacher;

    @Column(nullable = false)
    private String subject;

    @Column(nullable = false)
    private int semester;

    @Column(nullable = false)
    private int grade;

    @Enumerated(EnumType.STRING)
    @Column(name = "grade_type", nullable = false, length = 20)
    private GradeType gradeType;

    @Column(nullable = false, updatable = false)
    private Instant createdAt;

    public Grade(User student, User teacher, String subject, int semester, int grade, GradeType gradeType) {
        this.student = student;
        this.teacher = teacher;
        this.subject = subject;
        this.semester = semester;
        this.grade = grade;
        this.gradeType = gradeType;
    }

    @PrePersist
    void onCreate() {
        if (createdAt == null) {
            createdAt = Instant.now();
        }
    }
}
