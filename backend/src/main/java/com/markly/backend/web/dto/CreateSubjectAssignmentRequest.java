package com.markly.backend.web.dto;

import jakarta.validation.constraints.NotBlank;

public record CreateSubjectAssignmentRequest(
        @NotBlank(message = "Имейлът на учителя е задължителен") String teacherUsername,
        /** {@code null} or blank means the assignment covers every group — normalized to the {@code ""} sentinel on write. */
        String groupNumber
) {
}
