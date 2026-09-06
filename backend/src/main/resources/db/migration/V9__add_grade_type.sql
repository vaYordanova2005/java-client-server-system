ALTER TABLE grades ADD COLUMN grade_type VARCHAR(20);

-- Legacy rows predate this column and were never assigned an explicit type;
-- the frontend used to infer regular-vs-retake purely by createdAt order
-- within the same (student, semester, subject) — the first entry was
-- "regular", every later one a "retake". Reproduce that exact rule here so
-- existing data keeps reading the same way it always has, instead of
-- collapsing every legacy row to one default type. Written as a correlated
-- subquery (rather than a window-function CTE) so it runs unchanged against
-- both Postgres and the H2-in-PostgreSQL-mode instance the test suite uses.
UPDATE grades g
SET grade_type = CASE
    WHEN EXISTS (
        SELECT 1 FROM grades earlier
        WHERE earlier.student_id = g.student_id
          AND earlier.semester = g.semester
          AND earlier.subject = g.subject
          AND (earlier.created_at < g.created_at
               OR (earlier.created_at = g.created_at AND earlier.id < g.id))
    ) THEN 'RETAKE'
    ELSE 'REGULAR'
END
WHERE g.grade_type IS NULL;

ALTER TABLE grades ALTER COLUMN grade_type SET NOT NULL;
ALTER TABLE grades ADD CONSTRAINT grades_grade_type_check
    CHECK (grade_type IN ('TEST', 'ORAL_EXAM', 'CLASS_TEST', 'REGULAR', 'RETAKE'));
