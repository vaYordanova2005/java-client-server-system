package com.markly.backend.web.dto;

import com.markly.backend.domain.Grade;
import com.markly.backend.domain.GradeType;

import java.time.Instant;

public record GradeResponse(
        Long id,
        String subject,
        int semester,
        int grade,
        GradeType gradeType,
        Instant createdAt,
        String teacherUsername) {
    public static GradeResponse from(Grade grade) {
        return new GradeResponse(
                grade.getId(),
                grade.getSubject(),
                grade.getSemester(),
                grade.getGrade(),
                grade.getGradeType(),
                grade.getCreatedAt(),
                grade.getTeacher() != null ? grade.getTeacher().getUsername() : null);
    }
}
