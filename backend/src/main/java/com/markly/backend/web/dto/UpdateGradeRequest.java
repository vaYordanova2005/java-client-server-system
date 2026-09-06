package com.markly.backend.web.dto;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;

/**
 * Deliberately has no {@code studentUsername} field: a correction can change
 * what was recorded (subject, semester, grade) but never who it was recorded
 * for — reassigning a grade to a different student is a delete-and-recreate,
 * not an edit.
 */
public record UpdateGradeRequest(
        @NotBlank(message = "Предметът е задължителен") String subject,
        @Min(value = 1, message = "Семестърът трябва да е между 1 и 8")
        @Max(value = 8, message = "Семестърът трябва да е между 1 и 8") int semester,
        @Min(value = 2, message = "Оценката трябва да е между 2 и 6")
        @Max(value = 6, message = "Оценката трябва да е между 2 и 6") int grade
) {
}
