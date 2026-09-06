package com.markly.backend.web.dto;

import com.markly.backend.domain.Grade;
import com.markly.backend.domain.GradeType;
import com.markly.backend.domain.StudentProfile;

import java.time.Instant;

/**
 * Separate from {@link GradeResponse} on purpose: {@code Grade.student} is
 * lazy, and the student-facing endpoint's query never fetches it (a student
 * only ever asks for their own grades, so the student's own username adds
 * nothing). Reading {@code grade.getStudent()} through the shared DTO would
 * have added an N+1 SELECT to that already-fast path. This DTO is only ever
 * built from {@code GradeRepository.findByTeacherOrderByCreatedAtDesc}, which
 * fetches {@code student} eagerly in its own query.
 *
 * <p>The registrar fields ({@code facultyNumber}, {@code specialty}, {@code
 * groupNumber}) come from the student's {@link StudentProfile}, which is a
 * separate optional entity — they are all {@code null} for a student the
 * admin has not filled in a profile for yet. The profile is passed in rather
 * than read off the grade so the caller can batch-load every profile in one
 * query instead of one per grade.
 */
public record TeacherGradeResponse(
        Long id,
        String subject,
        int semester,
        int grade,
        GradeType gradeType,
        Instant createdAt,
        String studentUsername,
        String facultyNumber,
        String specialty,
        String groupNumber) {
    public static TeacherGradeResponse from(Grade grade, StudentProfile profile) {
        return new TeacherGradeResponse(
                grade.getId(),
                grade.getSubject(),
                grade.getSemester(),
                grade.getGrade(),
                grade.getGradeType(),
                grade.getCreatedAt(),
                grade.getStudent().getUsername(),
                profile == null ? null : profile.getFacultyNumber(),
                profile == null ? null : profile.getSpecialty(),
                profile == null ? null : profile.getGroupNumber());
    }
}
