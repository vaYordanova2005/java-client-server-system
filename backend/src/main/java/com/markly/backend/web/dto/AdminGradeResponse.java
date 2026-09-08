package com.markly.backend.web.dto;

import com.markly.backend.domain.Grade;
import com.markly.backend.domain.GradeType;
import com.markly.backend.domain.StudentProfile;

import java.time.Instant;

/**
 * Cross-teacher counterpart to {@link TeacherGradeResponse}: carries
 * {@code teacherUsername} and {@code faculty} on top of the same registrar
 * fields, since an admin's system-wide journal needs to say who entered a
 * grade and to group by faculty, neither of which a single teacher's own
 * journal needs.
 */
public record AdminGradeResponse(
        Long id,
        String subject,
        int semester,
        int grade,
        GradeType gradeType,
        Instant createdAt,
        String studentUsername,
        String teacherUsername,
        String facultyNumber,
        String faculty,
        String specialty,
        String groupNumber) {
    public static AdminGradeResponse from(Grade grade, StudentProfile profile) {
        return new AdminGradeResponse(
                grade.getId(),
                grade.getSubject(),
                grade.getSemester(),
                grade.getGrade(),
                grade.getGradeType(),
                grade.getCreatedAt(),
                grade.getStudent().getUsername(),
                // Grade.teacher is nullable for legacy rows that predate the
                // column (see Grade.java) despite the mapping being optional=false.
                grade.getTeacher() == null ? null : grade.getTeacher().getUsername(),
                profile == null ? null : profile.getFacultyNumber(),
                profile == null ? null : profile.getFaculty(),
                profile == null ? null : profile.getSpecialty(),
                profile == null ? null : profile.getGroupNumber());
    }
}
