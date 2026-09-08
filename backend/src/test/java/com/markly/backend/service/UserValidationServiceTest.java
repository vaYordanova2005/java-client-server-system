package com.markly.backend.service;

import com.markly.backend.domain.Role;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.junit.jupiter.api.Assertions.assertThrows;

class UserValidationServiceTest {

    private final UserValidationService service = new UserValidationService();

    @Test
    void acceptsValidTeacher() {
        assertDoesNotThrow(() -> service.validate(Role.TEACHER, "ivanov@uni-sofia.bg", "Silna-Parola1"));
    }

    @Test
    void acceptsTeacherWithTrailingDigits() {
        assertDoesNotThrow(() -> service.validate(Role.TEACHER, "teacher1@uni-sofia.bg", "Silna-Parola1"));
    }

    @Test
    void rejectsTeacherWithBadEmailDomain() {
        assertThrows(IllegalArgumentException.class,
                () -> service.validate(Role.TEACHER, "ivanov@gmail.com", "Silna-Parola1"));
    }

    @Test
    void rejectsTeacherWithShortPassword() {
        assertThrows(IllegalArgumentException.class,
                () -> service.validate(Role.TEACHER, "ivanov@uni-sofia.bg", "ab"));
    }

    @Test
    void acceptsValidStudent() {
        assertDoesNotThrow(() -> service.validate(Role.STUDENT, "student1@test.com", "Silna-Parola1"));
    }

    @Test
    void rejectsStudentWithInvalidEmail() {
        assertThrows(IllegalArgumentException.class,
                () -> service.validate(Role.STUDENT, "not-an-email", "Silna-Parola1"));
    }

    @Test
    void rejectsStudentWithShortPassword() {
        assertThrows(IllegalArgumentException.class,
                () -> service.validate(Role.STUDENT, "student1@test.com", "123"));
    }

    @Test
    void rejectsPasswordWithoutAnUppercaseLetter() {
        assertThrows(IllegalArgumentException.class,
                () -> service.validate(Role.STUDENT, "student1@test.com", "silna-parola1"));
    }

    @Test
    void rejectsPasswordWithoutADigit() {
        assertThrows(IllegalArgumentException.class,
                () -> service.validate(Role.STUDENT, "student1@test.com", "Silna-Parola"));
    }

    @Test
    void rejectsPasswordContainingTheUsername() {
        assertThrows(IllegalArgumentException.class,
                () -> service.validate(Role.STUDENT, "student1@test.com", "Student1-Parola2"));
    }

    @Test
    void rejectsACommonPassword() {
        assertThrows(IllegalArgumentException.class,
                () -> service.validate(Role.STUDENT, "ivan@test.com", "Password123"));
    }

    @Test
    void rejectsAdminRole() {
        assertThrows(IllegalArgumentException.class,
                () -> service.validate(Role.ADMIN, "admin", "Silna-Parola1"));
    }

    @Test
    void demoPasswordValidationAcceptsAPasswordWithNoUppercase() {
        // The whole point of validateDemoPassword vs. validatePassword: this
        // is exactly what password12345 (the documented demo/seed password)
        // looks like, and validatePassword would reject it.
        assertDoesNotThrow(() -> service.validateDemoPassword("teacher1@uni-sofia.bg", "password12345"));
        assertThrows(IllegalArgumentException.class,
                () -> service.validatePassword("teacher1@uni-sofia.bg", "password12345"));
    }

    @Test
    void demoPasswordValidationStillRejectsATooShortPassword() {
        assertThrows(IllegalArgumentException.class,
                () -> service.validateDemoPassword("teacher1@uni-sofia.bg", "short1"));
    }

    @Test
    void demoPasswordValidationStillRejectsACommonPassword() {
        assertThrows(IllegalArgumentException.class,
                () -> service.validateDemoPassword("ivan@test.com", "password123"));
    }

    @Test
    void demoPasswordValidationStillRejectsAPasswordContainingTheUsername() {
        assertThrows(IllegalArgumentException.class,
                () -> service.validateDemoPassword("student1@test.com", "student1-parola"));
    }
}
