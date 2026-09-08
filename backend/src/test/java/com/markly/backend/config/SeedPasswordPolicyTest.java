package com.markly.backend.config;

import com.markly.backend.service.UserValidationService;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;

/**
 * The seeded accounts are created outside the admin panel and so never pass
 * through {@code AdminController}'s validation. {@code DataSeeder} checks the
 * configured admin password at startup; the demo passwords are constants, so
 * they are checked here instead — a value that's actually too short, too
 * common, or built from the username would otherwise ship a set of demo
 * accounts nobody meant to weaken that far.
 *
 * <p>This checks {@link UserValidationService#validateDemoPassword}, not
 * {@link UserValidationService#validatePassword} — the demo constant is
 * {@code password12345} by explicit project decision ({@code
 * documentation/decisions.md}, "Passwords"), which does not have an
 * uppercase character and so would never pass the stricter admin-panel rule.
 */
class SeedPasswordPolicyTest {

    private final UserValidationService service = new UserValidationService();

    @Test
    void demoPasswordsSatisfyThePasswordPolicy() {
        assertDoesNotThrow(() -> service.validateDemoPassword(
                "teacher1@uni-sofia.bg", DemoDataSeeder.DEMO_TEACHER_PASSWORD));
        assertDoesNotThrow(() -> service.validateDemoPassword(
                "student1@uni-sofia.bg", DemoDataSeeder.DEMO_STUDENT_PASSWORD));
    }
}
