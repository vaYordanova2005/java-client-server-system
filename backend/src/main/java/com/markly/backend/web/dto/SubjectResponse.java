package com.markly.backend.web.dto;

import com.markly.backend.domain.Subject;

public record SubjectResponse(Long id, String name, String faculty, String specialty, boolean active) {
    public static SubjectResponse from(Subject subject) {
        return new SubjectResponse(
                subject.getId(), subject.getName(), subject.getFaculty(), subject.getSpecialty(), subject.isActive());
    }
}
