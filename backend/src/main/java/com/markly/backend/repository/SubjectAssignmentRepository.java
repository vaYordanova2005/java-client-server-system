package com.markly.backend.repository;

import com.markly.backend.domain.Subject;
import com.markly.backend.domain.SubjectAssignment;
import com.markly.backend.domain.User;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;

public interface SubjectAssignmentRepository extends JpaRepository<SubjectAssignment, Long> {

    /** {@code open-in-view} is disabled, so {@code teacher} must be fetched eagerly for {@code SubjectAssignmentResponse}. */
    @Query("select a from SubjectAssignment a join fetch a.teacher where a.subject = :subject order by a.groupNumber asc")
    List<SubjectAssignment> findBySubjectOrderByGroupNumberAsc(@Param("subject") Subject subject);

    boolean existsBySubjectAndTeacherAndGroupNumber(Subject subject, User teacher, String groupNumber);

    /** Hard-delete guard — see {@code AdminSubjectController#deleteSubjectPermanently}. */
    boolean existsBySubject(Subject subject);
}
