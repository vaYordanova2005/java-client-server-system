package com.markly.backend.web.dto;

import com.markly.backend.domain.Grade;

import java.time.Instant;

/**
 * Separate from {@link GradeResponse} on purpose: {@code Grade.student} is
 * lazy, and the student-facing endpoint's query never fetches it (a student
 * only ever asks for their own grades, so the student's own username adds
 * nothing). Reading {@code grade.getStudent()} through the shared DTO would
 * have added an N+1 SELECT to that already-fast path. This DTO is only ever
 * built from {@code GradeRepository.findByTeacherOrderByCreatedAtDesc}, which
 * fetches {@code student} eagerly in its own query.
 */
public record TeacherGradeResponse(
        Long id, String subject, int semester, int grade, Instant createdAt, String studentUsername) {
    public static TeacherGradeResponse from(Grade grade) {
        return new TeacherGradeResponse(
                grade.getId(),
                grade.getSubject(),
                grade.getSemester(),
                grade.getGrade(),
                grade.getCreatedAt(),
                grade.getStudent().getUsername());
    }
}
