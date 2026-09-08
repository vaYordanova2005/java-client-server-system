package com.markly.backend.service;

import com.markly.backend.domain.Role;
import com.markly.backend.domain.StudentProfile;
import com.markly.backend.domain.User;
import com.markly.backend.repository.StudentProfileRepository;
import com.markly.backend.repository.UserRepository;
import com.markly.backend.web.dto.StudentRosterResponse;
import org.springframework.stereotype.Service;

import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

/**
 * Shared by {@code TeacherController} and {@code AdminController}: both need
 * the full student directory (every student, not just ones someone has
 * already graded), and the batch-profile-fetch logic that avoids an N+1 over
 * it would otherwise have to be duplicated in two controllers and kept in
 * sync by hand.
 */
@Service
public class StudentRosterService {

    private final UserRepository userRepository;
    private final StudentProfileRepository studentProfileRepository;

    public StudentRosterService(UserRepository userRepository, StudentProfileRepository studentProfileRepository) {
        this.userRepository = userRepository;
        this.studentProfileRepository = studentProfileRepository;
    }

    public List<StudentRosterResponse> allStudents() {
        return build(userRepository.findByRole(Role.STUDENT));
    }

    /** The demo teacher's view of {@link #allStudents()} — real students must never appear in it. */
    public List<StudentRosterResponse> demoStudents() {
        return build(userRepository.findByRole(Role.STUDENT).stream().filter(User::isDemo).toList());
    }

    private List<StudentRosterResponse> build(List<User> students) {
        Map<Long, StudentProfile> profilesByStudentId = students.isEmpty()
                ? Map.of()
                : studentProfileRepository.findByStudentIn(students).stream()
                        .collect(Collectors.toMap(p -> p.getStudent().getId(), p -> p));
        return students.stream()
                .map(s -> StudentRosterResponse.from(s, profilesByStudentId.get(s.getId())))
                .sorted(Comparator.comparing(StudentRosterResponse::studentUsername, String.CASE_INSENSITIVE_ORDER))
                .toList();
    }
}
