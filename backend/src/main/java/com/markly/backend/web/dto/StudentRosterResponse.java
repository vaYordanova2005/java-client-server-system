package com.markly.backend.web.dto;

import com.markly.backend.domain.StudentProfile;
import com.markly.backend.domain.User;

/**
 * The full student roster, independent of who has graded whom — unlike
 * {@link TeacherGradeResponse}, which only ever lists students the requesting
 * teacher has already entered a grade for. A teacher with zero grades on
 * record (or one who wants to grade a student they've never taught before)
 * still needs a way to find that student; this is what {@code
 * GET /teacher/students} returns.
 */
public record StudentRosterResponse(
        String studentUsername,
        String facultyNumber,
        String specialty,
        String groupNumber) {
    public static StudentRosterResponse from(User student, StudentProfile profile) {
        return new StudentRosterResponse(
                student.getUsername(),
                profile == null ? null : profile.getFacultyNumber(),
                profile == null ? null : profile.getSpecialty(),
                profile == null ? null : profile.getGroupNumber());
    }
}
