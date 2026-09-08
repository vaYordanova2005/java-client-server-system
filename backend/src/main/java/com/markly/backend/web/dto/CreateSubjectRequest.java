package com.markly.backend.web.dto;

import jakarta.validation.constraints.NotBlank;

public record CreateSubjectRequest(
        @NotBlank(message = "Името на предмета е задължително") String name,
        String faculty,
        String specialty
) {
}
