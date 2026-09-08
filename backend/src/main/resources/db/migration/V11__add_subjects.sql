-- Additive catalog only — Grade.subject stays free text (see domain/Subject.java).
--
-- No plain UNIQUE(name): a soft-deleted (active=false) subject must not
-- block creating a new active subject of the same name, but must still
-- collide with itself so an admin doesn't create a duplicate name without
-- being pointed at the option to reactivate instead. UNIQUE(name, active) —
-- a portable, ordinary multi-column constraint, unlike a partial/filtered
-- index, which H2 (this project's test database) does not support even in
-- PostgreSQL compatibility mode — allows at most one active and at most one
-- inactive row per name, which is exactly that.
CREATE TABLE subjects (
    id BIGSERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    faculty VARCHAR(255),
    specialty VARCHAR(255),
    active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP NOT NULL,
    UNIQUE (name, active)
);

-- group_number is NOT NULL with an empty-string default, never NULL: a
-- subject-wide (non-group-scoped) assignment is represented by '', because
-- Postgres treats distinct NULLs as never equal to each other, which would
-- let a NULL-based UNIQUE constraint silently admit duplicate "no group"
-- assignments for the same teacher+subject.
CREATE TABLE subject_teacher_assignments (
    id BIGSERIAL PRIMARY KEY,
    subject_id BIGINT NOT NULL REFERENCES subjects(id),
    teacher_id BIGINT NOT NULL REFERENCES users(id),
    group_number VARCHAR(50) NOT NULL DEFAULT '',
    UNIQUE (subject_id, teacher_id, group_number)
);
