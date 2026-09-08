-- No foreign key to users: actor_username/target_username are plain-text
-- snapshots of the username at the time of the event, not a reference to
-- users.id. This is deliberate — a hard-deleted user's own audit trail must
-- survive the delete instead of being cascade-deleted or orphaned, and the
-- row needs to stay readable ("who did what to whom") even after the
-- account behind either username is gone.
CREATE TABLE audit_log (
    id BIGSERIAL PRIMARY KEY,
    event_type VARCHAR(40) NOT NULL,
    actor_username VARCHAR(255),
    target_username VARCHAR(255),
    ip VARCHAR(64),
    detail TEXT,
    created_at TIMESTAMP NOT NULL
);

CREATE INDEX idx_audit_log_created_at ON audit_log(created_at DESC);
CREATE INDEX idx_audit_log_event_type ON audit_log(event_type);
