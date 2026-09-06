package com.markly.backend.repository;

import com.markly.backend.domain.StudentProfile;
import com.markly.backend.domain.User;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.Collection;
import java.util.List;
import java.util.Optional;

public interface StudentProfileRepository extends JpaRepository<StudentProfile, Long> {

    Optional<StudentProfile> findByStudent(User student);

    /**
     * Exact match, not "IgnoreCase". Uniqueness and case-insensitivity for
     * {@code faculty_number} both come from write-time normalization
     * (blank -> {@code null}, otherwise {@code trim().toUpperCase()} — see
     * {@code StudentProfileNormalizer}) plus a plain unique index, not from
     * this query. Callers must normalize their input the same way before
     * calling this method; an "IgnoreCase" query would both bypass the index
     * (Spring Data would emit {@code upper(faculty_number) = upper(?)}, an
     * expression predicate the plain index doesn't cover) and imply a
     * case-insensitivity guarantee that doesn't actually live here.
     *
     * <p>{@code left join fetch p.student}: {@code open-in-view} is disabled
     * ({@code application.yml}), so the lazy {@code student} association
     * would otherwise throw {@code LazyInitializationException} the moment
     * the controller reads {@code profile.getStudent().getUsername()} after
     * this repository call returns and the persistence context is closed.
     */
    @Query("select p from StudentProfile p left join fetch p.student where p.facultyNumber = :facultyNumber")
    Optional<StudentProfile> findByFacultyNumber(@Param("facultyNumber") String facultyNumber);

    /**
     * Batch counterpart to {@link #findByStudent(User)}: the teacher journal
     * needs the profile of every student it lists, and asking per student
     * would be an N+1 over the grade list. {@code join fetch p.student} for
     * the same reason as {@link #findByFacultyNumber(String)} — callers key
     * the result by the student, and {@code open-in-view} is disabled.
     */
    @Query("select p from StudentProfile p join fetch p.student s where s in :students")
    List<StudentProfile> findByStudentIn(@Param("students") Collection<User> students);

    boolean existsByFacultyNumberAndStudentNot(String facultyNumber, User student);
}
