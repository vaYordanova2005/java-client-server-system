package com.markly.backend.repository;

import com.markly.backend.domain.Grade;
import com.markly.backend.domain.User;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;

public interface GradeRepository extends JpaRepository<Grade, Long> {

    @Query("select g from Grade g left join fetch g.teacher where g.student = :student "
            + "order by g.semester asc, g.subject asc")
    List<Grade> findByStudentOrderBySemesterAscSubjectAsc(@Param("student") User student);

    @Query("select g from Grade g left join fetch g.student where g.teacher = :teacher "
            + "order by g.createdAt desc")
    List<Grade> findByTeacherOrderByCreatedAtDesc(@Param("teacher") User teacher);

    /**
     * Ownership check and lookup in one query: a mismatched id/teacher pair
     * looks identical to a missing id to the caller (404 either way), so
     * TeacherController never has to decide between 403 and 404 and never
     * risks confirming that an id exists under another teacher's account.
     *
     * <p>{@code left join fetch g.student}: {@code open-in-view} is disabled,
     * so building a {@code TeacherGradeResponse} (which reads {@code
     * grade.getStudent().getUsername()}) after this call returns would
     * otherwise throw {@code LazyInitializationException} once the
     * persistence context is closed.
     */
    @Query("select g from Grade g left join fetch g.student where g.id = :id and g.teacher = :teacher")
    Optional<Grade> findByIdAndTeacher(@Param("id") Long id, @Param("teacher") User teacher);

    /**
     * System-wide, for the admin journal/statistics views — unlike the two
     * queries above, both {@code student} and {@code teacher} are fetched
     * eagerly, since {@code AdminGradeResponse} reads both associations and
     * {@code open-in-view} is disabled.
     */
    @Query("select g from Grade g left join fetch g.student left join fetch g.teacher order by g.createdAt desc")
    List<Grade> findAllByOrderByCreatedAtDesc();

    /** Delete guards: a user with any grade history must be deactivated, not deleted — see {@code AdminController#deleteUser}. */
    boolean existsByStudent(User student);

    boolean existsByTeacher(User teacher);
}
