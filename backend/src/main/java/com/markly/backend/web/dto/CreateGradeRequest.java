package com.markly.backend.web.dto;

import com.markly.backend.domain.GradeType;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;

public record CreateGradeRequest(
        @NotBlank(message = "Имейлът на ученика е задължителен") String studentUsername,
        @NotBlank(message = "Предметът е задължителен") String subject,
        @Min(value = 1, message = "Семестърът трябва да е между 1 и 8")
        @Max(value = 8, message = "Семестърът трябва да е между 1 и 8") int semester,
        @Min(value = 2, message = "Оценката трябва да е между 2 и 6")
        @Max(value = 6, message = "Оценката трябва да е между 2 и 6") int grade,
        @NotNull(message = "Типът на оценката е задължителен") GradeType gradeType
) {
}
