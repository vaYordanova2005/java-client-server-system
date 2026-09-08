package com.markly.backend.web.dto;

import jakarta.validation.constraints.NotBlank;

public record AdminResetPasswordRequest(
        @NotBlank(message = "Новата парола е задължителна") String newPassword
) {
}
