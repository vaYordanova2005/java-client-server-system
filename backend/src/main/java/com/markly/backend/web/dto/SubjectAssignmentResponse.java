package com.markly.backend.web.dto;

import com.markly.backend.domain.SubjectAssignment;

public record SubjectAssignmentResponse(Long id, String teacherUsername, String groupNumber) {
    public static SubjectAssignmentResponse from(SubjectAssignment assignment) {
        // "" (the no-group sentinel, see SubjectAssignment) reads back as
        // null over the API — the frontend shouldn't have to know about the
        // sentinel to tell "every group" apart from "one specific group".
        String groupNumber = assignment.getGroupNumber().isEmpty() ? null : assignment.getGroupNumber();
        return new SubjectAssignmentResponse(assignment.getId(), assignment.getTeacher().getUsername(), groupNumber);
    }
}
