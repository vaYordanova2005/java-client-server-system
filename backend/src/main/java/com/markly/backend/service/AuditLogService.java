package com.markly.backend.service;

import com.markly.backend.domain.AuditLog;
import com.markly.backend.repository.AuditLogRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

/**
 * Single funnel for an audit event: persists a row and forwards it to the
 * {@code com.markly.audit} SLF4J logger, so the two never drift apart the way
 * two independent call sites eventually would.
 *
 * <p>{@code detail} must never carry raw user input — no passwords, no full
 * CSV row contents, no filenames, no full profile dumps — only structured,
 * non-sensitive summaries (counts, ids, an old/new status). This is enforced
 * by convention at each call site, not by this class; keep it in mind when
 * wiring up a new event type.
 */
@Service
public class AuditLogService {

    private static final Logger audit = LoggerFactory.getLogger("com.markly.audit");

    private final AuditLogRepository auditLogRepository;

    public AuditLogService(AuditLogRepository auditLogRepository) {
        this.auditLogRepository = auditLogRepository;
    }

    /**
     * Runs in its own transaction, independent of the caller's: a rolled-back
     * outer transaction (a failed login, a delete that throws after this
     * call) must not erase the very row meant to record the failure — that
     * would make the log lie by omission exactly when it matters most.
     */
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void record(String eventType, String actorUsername, String targetUsername, String ip, String detail) {
        audit.info("{} actor='{}' target='{}' ip={} detail='{}'", eventType, actorUsername, targetUsername, ip, detail);
        auditLogRepository.save(new AuditLog(eventType, actorUsername, targetUsername, ip, detail));
    }
}
