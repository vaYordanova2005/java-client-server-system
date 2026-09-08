package com.markly.backend.web;

import com.markly.backend.domain.Grade;
import com.markly.backend.domain.Role;
import com.markly.backend.domain.StudentProfile;
import com.markly.backend.domain.User;
import com.markly.backend.repository.GradeRepository;
import com.markly.backend.repository.StudentProfileRepository;
import com.markly.backend.repository.UserRepository;
import com.markly.backend.security.AppUserPrincipal;
import com.markly.backend.service.StudentProfileNormalizer;
import com.markly.backend.service.StudentRosterService;
import com.markly.backend.web.dto.CreateGradeRequest;
import com.markly.backend.web.dto.GradeResponse;
import com.markly.backend.web.dto.StudentLookupResponse;
import com.markly.backend.web.dto.StudentRosterResponse;
import com.markly.backend.web.dto.TeacherGradeResponse;
import com.markly.backend.web.dto.UpdateGradeRequest;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;

@RestController
@RequestMapping("/api/teacher")
public class TeacherController {

    private final UserRepository userRepository;
    private final GradeRepository gradeRepository;
    private final StudentProfileRepository studentProfileRepository;
    private final StudentRosterService studentRosterService;

    public TeacherController(
            UserRepository userRepository,
            GradeRepository gradeRepository,
            StudentProfileRepository studentProfileRepository,
            StudentRosterService studentRosterService) {
        this.userRepository = userRepository;
        this.gradeRepository = gradeRepository;
        this.studentProfileRepository = studentProfileRepository;
        this.studentRosterService = studentRosterService;
    }

    /**
     * Accepts either a faculty number or an email so a teacher can resolve
     * whichever one they actually have on hand — a class roster usually has
     * faculty numbers, not emails. {@code query} is tried as a faculty number
     * first (normalized the same way {@code AdminController} normalizes on
     * write, so the exact-match repository query is safe); only if that
     * fails is it treated as an email. This is a lookup convenience only —
     * grades are still recorded against the resolved account's email
     * ({@link #addGrade}), so the account identifier stays the email, per
     * documentation/decisions.md.
     */
    @GetMapping("/students/lookup")
    public StudentLookupResponse lookupStudent(@RequestParam String query) {
        String normalized = StudentProfileNormalizer.normalizeFacultyNumber(query);
        if (normalized != null) {
            var byFacultyNumber = studentProfileRepository.findByFacultyNumber(normalized);
            if (byFacultyNumber.isPresent()) {
                StudentProfile profile = byFacultyNumber.get();
                return StudentLookupResponse.from(profile, profile.getStudent().getUsername());
            }
        }

        User student = userRepository.findByUsernameIgnoreCase(query.trim())
                .filter(u -> u.getRole() == Role.STUDENT)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Няма ученик с такъв факултетен номер или имейл"));
        return studentProfileRepository.findByStudent(student)
                .map(profile -> StudentLookupResponse.from(profile, student.getUsername()))
                .orElseGet(() -> StudentLookupResponse.empty(student.getUsername()));
    }

    /**
     * Every student, regardless of whether this (or any) teacher has entered
     * a grade for them yet — {@link #myGrades} only surfaces students who
     * already have at least one grade from this teacher, which leaves a
     * teacher with zero grades on record, or one grading a student for the
     * first time, with no way to find them. The frontend roster page builds
     * its specialty/group tree from this endpoint and overlays this
     * teacher's own grades (from {@link #myGrades}) on top.
     *
     * <p>Deliberately unpaginated and unscoped: it returns the whole
     * directory (every student's email and faculty number) to any
     * authenticated teacher, sorted in memory on every call. There is no
     * teacher-to-group assignment anywhere in this domain model to scope by
     * — a teacher may legitimately need to grade a student outside their
     * usual groups — so "my groups only" isn't a fix available today without
     * adding that concept first. Fine at this app's scale (a few dozen
     * students); if the roster grows into the thousands or the lack of
     * per-teacher scoping becomes a real privacy concern, this needs
     * pagination and/or a teacher-group mapping to filter by, not a
     * band-aid on this method. Shared with the admin roster
     * ({@code AdminController}) via {@link StudentRosterService}.
     */
    @GetMapping("/students")
    public List<StudentRosterResponse> allStudents() {
        return studentRosterService.allStudents();
    }

    /**
     * Each grade carries the student's faculty number, specialty and group so
     * the journal can group and search by them. The profiles are fetched in a
     * single batch query keyed by student — one profile lookup per grade would
     * be an N+1 over a list that repeats the same students many times.
     */
    @GetMapping("/grades")
    public List<TeacherGradeResponse> myGrades(@AuthenticationPrincipal AppUserPrincipal principal) {
        List<Grade> grades = gradeRepository.findByTeacherOrderByCreatedAtDesc(principal.getUser());
        Set<User> students = grades.stream().map(Grade::getStudent).collect(Collectors.toSet());
        Map<Long, StudentProfile> profilesByStudentId = students.isEmpty()
                ? Map.of()
                : studentProfileRepository.findByStudentIn(students).stream()
                        .collect(Collectors.toMap(p -> p.getStudent().getId(), p -> p));
        return grades.stream()
                .map(g -> TeacherGradeResponse.from(g, profilesByStudentId.get(g.getStudent().getId())))
                .toList();
    }

    @PostMapping("/grades")
    @ResponseStatus(HttpStatus.CREATED)
    public GradeResponse addGrade(
            @Valid @RequestBody CreateGradeRequest request,
            @AuthenticationPrincipal AppUserPrincipal principal) {
        User student = userRepository.findByUsernameIgnoreCase(request.studentUsername())
                .filter(u -> u.getRole() == Role.STUDENT)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Невалиден имейл на ученик"));

        Grade grade = new Grade(
                student, principal.getUser(), request.subject(), request.semester(), request.grade(), request.gradeType());
        return GradeResponse.from(gradeRepository.save(grade));
    }

    @PutMapping("/grades/{id}")
    public TeacherGradeResponse updateGrade(
            @PathVariable Long id,
            @Valid @RequestBody UpdateGradeRequest request,
            @AuthenticationPrincipal AppUserPrincipal principal) {
        Grade grade = findOwnGrade(id, principal);
        grade.setSubject(request.subject());
        grade.setSemester(request.semester());
        grade.setGrade(request.grade());
        grade.setGradeType(request.gradeType());
        gradeRepository.save(grade);
        // Built from `grade`, not save()'s return value: `findOwnGrade` runs
        // in its own transaction (open-in-view is disabled and this
        // controller isn't @Transactional), so by the time save() returns,
        // its own transaction has also closed. JpaRepository.save() on a
        // detached entity with an id merges it into a *new* managed
        // instance, and without cascade=MERGE on Grade#student that copy's
        // student association is a fresh, uninitialized proxy — reading it
        // here would throw LazyInitializationException. `grade` itself is
        // the object findOwnGrade returned, whose student was already
        // fetched eagerly, so it's safe to read after any transaction ends.
        return TeacherGradeResponse.from(
                grade, studentProfileRepository.findByStudent(grade.getStudent()).orElse(null));
    }

    @DeleteMapping("/grades/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void deleteGrade(@PathVariable Long id, @AuthenticationPrincipal AppUserPrincipal principal) {
        Grade grade = findOwnGrade(id, principal);
        gradeRepository.delete(grade);
    }

    /**
     * 404, not 403, when the id belongs to another teacher — otherwise the
     * response itself would confirm the id exists under someone else's
     * account.
     */
    private Grade findOwnGrade(Long id, AppUserPrincipal principal) {
        return gradeRepository.findByIdAndTeacher(id, principal.getUser())
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Няма оценка с този идентификатор"));
    }
}
