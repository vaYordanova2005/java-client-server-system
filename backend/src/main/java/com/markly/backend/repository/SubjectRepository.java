package com.markly.backend.repository;

import com.markly.backend.domain.Subject;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface SubjectRepository extends JpaRepository<Subject, Long> {

    List<Subject> findAllByOrderByNameAsc();

    /** Used to give a friendly 400 instead of the raw {@code UNIQUE(name, active)} constraint violation. */
    Optional<Subject> findByNameAndActiveTrue(String name);

    /** Used to point a create/rename at reactivation instead of letting it collide with an inactive row. */
    Optional<Subject> findByNameAndActiveFalse(String name);
}
