package com.markly.backend.web.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;

/** Full-replace, like {@code UpsertStudentProfileRequest} — the frontend always sends the current form state, including {@code active}, so a reactivate-from-conflict action is just a PUT with {@code active=true}. */
public record UpdateSubjectRequest(
        @NotBlank(message = "Името на предмета е задължително") String name,
        String faculty,
        String specialty,
        @NotNull(message = "Статусът е задължителен") Boolean active
) {
}
