package com.markly.backend.web;

import com.markly.backend.domain.Role;
import com.markly.backend.domain.Subject;
import com.markly.backend.domain.SubjectAssignment;
import com.markly.backend.domain.User;
import com.markly.backend.repository.SubjectAssignmentRepository;
import com.markly.backend.repository.SubjectRepository;
import com.markly.backend.repository.UserRepository;
import com.markly.backend.security.AppUserPrincipal;
import com.markly.backend.security.ClientIpResolver;
import com.markly.backend.service.AuditLogService;
import com.markly.backend.web.dto.CreateSubjectAssignmentRequest;
import com.markly.backend.web.dto.CreateSubjectRequest;
import com.markly.backend.web.dto.SubjectAssignmentResponse;
import com.markly.backend.web.dto.SubjectResponse;
import com.markly.backend.web.dto.UpdateSubjectRequest;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

import java.util.List;

/**
 * Kept separate from {@link AdminController}, which already covers users and
 * student profiles — folding the subject catalog in there too would make an
 * already sizable controller harder to navigate.
 */
@RestController
@RequestMapping("/api/admin/subjects")
public class AdminSubjectController {

    private final SubjectRepository subjectRepository;
    private final SubjectAssignmentRepository subjectAssignmentRepository;
    private final UserRepository userRepository;
    private final AuditLogService auditLogService;
    private final ClientIpResolver clientIpResolver;

    public AdminSubjectController(
            SubjectRepository subjectRepository,
            SubjectAssignmentRepository subjectAssignmentRepository,
            UserRepository userRepository,
            AuditLogService auditLogService,
            ClientIpResolver clientIpResolver) {
        this.subjectRepository = subjectRepository;
        this.subjectAssignmentRepository = subjectAssignmentRepository;
        this.userRepository = userRepository;
        this.auditLogService = auditLogService;
        this.clientIpResolver = clientIpResolver;
    }

    @GetMapping
    public List<SubjectResponse> allSubjects() {
        return subjectRepository.findAllByOrderByNameAsc().stream().map(SubjectResponse::from).toList();
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public SubjectResponse createSubject(
            @Valid @RequestBody CreateSubjectRequest request,
            @AuthenticationPrincipal AppUserPrincipal currentAdmin,
            HttpServletRequest httpRequest) {
        rejectNameCollision(request.name(), null);
        Subject subject = subjectRepository.save(new Subject(request.name(), request.faculty(), request.specialty()));
        auditLogService.record("SUBJECT_CREATED", currentAdmin.getUsername(), null,
                clientIpResolver.resolve(httpRequest), "id=" + subject.getId() + " name=" + subject.getName());
        return SubjectResponse.from(subject);
    }

    /**
     * Full-replace, including {@code active} — the frontend's reactivate
     * action from a name-collision 409 is just this endpoint called with
     * {@code active=true}.
     */
    @PutMapping("/{id}")
    public SubjectResponse updateSubject(
            @PathVariable Long id,
            @Valid @RequestBody UpdateSubjectRequest request,
            @AuthenticationPrincipal AppUserPrincipal currentAdmin,
            HttpServletRequest httpRequest) {
        Subject subject = findSubject(id);
        rejectNameCollision(request.name(), id);
        subject.setName(request.name());
        subject.setFaculty(request.faculty());
        subject.setSpecialty(request.specialty());
        subject.setActive(request.active());
        Subject saved = subjectRepository.save(subject);
        auditLogService.record("SUBJECT_UPDATED", currentAdmin.getUsername(), null,
                clientIpResolver.resolve(httpRequest), "id=" + id);
        return SubjectResponse.from(saved);
    }

    /**
     * Soft delete only: sets {@code active=false}, which hides the subject
     * from pickers (frontend) but keeps it — and any assignments referencing
     * it — in the catalog, reversible via {@link #updateSubject}. There is
     * no hard-delete endpoint in v1; the DB's FK from
     * {@code subject_teacher_assignments} would need explicit
     * assignment-cleanup handling first, and soft-delete already covers the
     * "stop offering this subject" need.
     */
    @DeleteMapping("/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void deactivateSubject(
            @PathVariable Long id, @AuthenticationPrincipal AppUserPrincipal currentAdmin, HttpServletRequest httpRequest) {
        Subject subject = findSubject(id);
        subject.setActive(false);
        subjectRepository.save(subject);
        auditLogService.record("SUBJECT_DELETED", currentAdmin.getUsername(), null,
                clientIpResolver.resolve(httpRequest), "id=" + id);
    }

    @GetMapping("/{id}/assignments")
    public List<SubjectAssignmentResponse> assignments(@PathVariable Long id) {
        Subject subject = findSubject(id);
        return subjectAssignmentRepository.findBySubjectOrderByGroupNumberAsc(subject).stream()
                .map(SubjectAssignmentResponse::from)
                .toList();
    }

    @PostMapping("/{id}/assignments")
    @ResponseStatus(HttpStatus.CREATED)
    public SubjectAssignmentResponse createAssignment(
            @PathVariable Long id,
            @Valid @RequestBody CreateSubjectAssignmentRequest request,
            @AuthenticationPrincipal AppUserPrincipal currentAdmin,
            HttpServletRequest httpRequest) {
        Subject subject = findSubject(id);
        User teacher = userRepository.findByUsernameIgnoreCase(request.teacherUsername())
                .filter(u -> u.getRole() == Role.TEACHER)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Няма учител с такъв имейл"));
        String groupNumber = request.groupNumber() == null || request.groupNumber().isBlank()
                ? ""
                : request.groupNumber().trim();

        if (subjectAssignmentRepository.existsBySubjectAndTeacherAndGroupNumber(subject, teacher, groupNumber)) {
            throw new IllegalArgumentException(
                    groupNumber.isEmpty()
                            ? "Този учител вече е разпределен за целия предмет"
                            : "Този учител вече е разпределен за тази група по този предмет");
        }

        SubjectAssignment assignment = subjectAssignmentRepository.save(
                new SubjectAssignment(subject, teacher, groupNumber));
        auditLogService.record("SUBJECT_ASSIGNMENT_CREATED", currentAdmin.getUsername(), teacher.getUsername(),
                clientIpResolver.resolve(httpRequest), "subjectId=" + id);
        return SubjectAssignmentResponse.from(assignment);
    }

    @DeleteMapping("/assignments/{assignmentId}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void deleteAssignment(
            @PathVariable Long assignmentId,
            @AuthenticationPrincipal AppUserPrincipal currentAdmin,
            HttpServletRequest httpRequest) {
        SubjectAssignment assignment = subjectAssignmentRepository.findById(assignmentId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Няма разпределение с този идентификатор"));
        subjectAssignmentRepository.delete(assignment);
        auditLogService.record("SUBJECT_ASSIGNMENT_DELETED", currentAdmin.getUsername(), null,
                clientIpResolver.resolve(httpRequest), "assignmentId=" + assignmentId);
    }

    /**
     * Guards the {@code UNIQUE(name, active)} constraint (V11) with a
     * friendly message before it can be hit as a raw 500: an active-name
     * collision is a plain duplicate (400), an inactive-name collision
     * points at reactivating that row instead (409, carrying its id).
     * {@code excludeId} lets an update pass when renaming a subject to its
     * own current name.
     */
    private void rejectNameCollision(String name, Long excludeId) {
        subjectRepository.findByNameAndActiveTrue(name)
                .filter(existing -> excludeId == null || !existing.getId().equals(excludeId))
                .ifPresent(existing -> {
                    throw new IllegalArgumentException("Вече съществува активен предмет с това име");
                });
        subjectRepository.findByNameAndActiveFalse(name)
                .filter(existing -> excludeId == null || !existing.getId().equals(excludeId))
                .ifPresent(existing -> {
                    throw new ResponseStatusException(HttpStatus.CONFLICT,
                            "Предмет с това име вече съществува (неактивен, id=" + existing.getId()
                                    + ") — възстановете го вместо да създавате нов");
                });
    }

    private Subject findSubject(Long id) {
        return subjectRepository.findById(id)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Няма предмет с този идентификатор"));
    }
}
