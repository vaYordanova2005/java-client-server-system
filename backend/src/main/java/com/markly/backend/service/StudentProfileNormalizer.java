package com.markly.backend.service;

/**
 * Shared by every writer of {@code student_profiles.faculty_number}
 * ({@code AdminController}, {@code DemoDataSeeder}, and the lookup input in
 * {@code TeacherController}). The column's uniqueness is enforced by a plain
 * (non-partial, non-expression) unique index — see
 * {@code V8__add_student_profile_faculty_number_unique_index.sql} — so the
 * invariant only holds if every writer normalizes the same way: blank input
 * becomes {@code null} (a plain unique index allows any number of {@code
 * NULL}s, but two empty strings would collide with each other), and every
 * other value is trimmed and upper-cased so a case-only difference collides
 * too instead of silently coexisting.
 */
public final class StudentProfileNormalizer {

    private StudentProfileNormalizer() {
    }

    public static String normalizeFacultyNumber(String facultyNumber) {
        if (facultyNumber == null) {
            return null;
        }
        String trimmed = facultyNumber.trim();
        return trimmed.isEmpty() ? null : trimmed.toUpperCase();
    }
}
