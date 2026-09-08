package com.markly.backend.web.dto;

import com.markly.backend.domain.StudentProfile;

/**
 * Deliberately narrower than {@link StudentProfileResponse}: a teacher
 * resolving a faculty number to confirm they've picked the right student
 * before grading them needs enough to recognize the person, not the whole
 * registrar record. {@code admissionType}, {@code status}, {@code
 * degreeLevel}, {@code studyMode}, {@code specialization} and {@code stream}
 * are intentionally omitted.
 */
public record StudentLookupResponse(
        String username,
        String facultyNumber,
        String faculty,
        String specialty,
        String groupNumber,
        Integer enrolledSemester
) {
    public static StudentLookupResponse from(StudentProfile profile, String username) {
        return new StudentLookupResponse(
                username,
                profile.getFacultyNumber(),
                profile.getFaculty(),
                profile.getSpecialty(),
                profile.getGroupNumber(),
                profile.getEnrolledSemester());
    }

    public static StudentLookupResponse empty(String username) {
        return new StudentLookupResponse(username, null, null, null, null, null);
    }
}
