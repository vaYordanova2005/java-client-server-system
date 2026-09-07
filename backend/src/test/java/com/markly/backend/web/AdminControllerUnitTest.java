package com.markly.backend.web;

import com.markly.backend.domain.Role;
import com.markly.backend.domain.StudentProfile;
import com.markly.backend.domain.User;
import com.markly.backend.repository.StudentProfileRepository;
import com.markly.backend.repository.UserRepository;
import com.markly.backend.service.UserValidationService;
import com.markly.backend.web.dto.UpsertStudentProfileRequest;
import org.hibernate.exception.ConstraintViolationException;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.security.crypto.password.PasswordEncoder;

import java.sql.SQLException;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertSame;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.when;

/**
 * Unit-level (no Spring context, no real database) coverage for the
 * DataIntegrityViolationException -> 400 translation in {@link
 * AdminController#upsertStudentProfile}. {@link AdminStudentProfileTest}
 * already covers the pre-check ({@code existsByFacultyNumberAndStudentNot})
 * path against a real database; the race window *past* that check — the
 * unique index catching what the pre-check missed — can only be forced
 * deterministically by mocking the repository to throw at save() time.
 * Reproducing it with genuine concurrent requests against H2 would be flaky
 * and slow for what is otherwise a two-line branch.
 */
@ExtendWith(MockitoExtension.class)
class AdminControllerUnitTest {

    @Mock
    private UserRepository userRepository;
    @Mock
    private UserValidationService userValidationService;
    @Mock
    private PasswordEncoder passwordEncoder;
    @Mock
    private StudentProfileRepository studentProfileRepository;

    private AdminController controller() {
        return new AdminController(userRepository, userValidationService, passwordEncoder, studentProfileRepository);
    }

    private UpsertStudentProfileRequest request(String username, String facultyNumber) {
        return new UpsertStudentProfileRequest(
                username, null, facultyNumber, null, null, null, null, null, null, null, 1, null, null);
    }

    private void stubExistingStudentWithNoProfile(User student) {
        when(userRepository.findByUsernameIgnoreCase(student.getUsername())).thenReturn(Optional.of(student));
        lenient().when(studentProfileRepository.findByStudent(student)).thenReturn(Optional.empty());
        lenient().when(studentProfileRepository.existsByFacultyNumberAndStudentNot(any(), any())).thenReturn(false);
    }

    @Test
    void translatesTheFacultyNumberUniqueIndexViolationIntoABadRequest() {
        User student = new User("student@uni-sofia.bg", "{noop}irrelevant", Role.STUDENT);
        stubExistingStudentWithNoProfile(student);
        ConstraintViolationException dbException = new ConstraintViolationException(
                "duplicate key value violates unique constraint",
                new SQLException("duplicate key"),
                "idx_student_profiles_faculty_number");
        when(studentProfileRepository.save(any(StudentProfile.class)))
                .thenThrow(new DataIntegrityViolationException("save failed", dbException));

        IllegalArgumentException thrown = assertThrows(IllegalArgumentException.class,
                () -> controller().upsertStudentProfile(request(student.getUsername(), "F12345")));

        assertEquals("Този факултетен номер вече принадлежи на друг ученик", thrown.getMessage());
    }

    @Test
    void rethrowsAnUnrelatedConstraintViolationInsteadOfMislabelingIt() {
        User student = new User("student@uni-sofia.bg", "{noop}irrelevant", Role.STUDENT);
        stubExistingStudentWithNoProfile(student);
        ConstraintViolationException dbException = new ConstraintViolationException(
                "null value in column violates not-null constraint",
                new SQLException("not null"),
                "some_other_constraint");
        DataIntegrityViolationException original =
                new DataIntegrityViolationException("save failed", dbException);
        when(studentProfileRepository.save(any(StudentProfile.class))).thenThrow(original);

        DataIntegrityViolationException thrown = assertThrows(DataIntegrityViolationException.class,
                () -> controller().upsertStudentProfile(request(student.getUsername(), "F12345")));

        assertSame(original, thrown);
    }
}
