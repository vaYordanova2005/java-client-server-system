package com.markly.backend.web.dto;

import com.markly.backend.domain.AuditLog;

import java.time.Instant;

public record AuditLogResponse(
        Long id,
        String eventType,
        String actorUsername,
        String targetUsername,
        String ip,
        String detail,
        Instant createdAt) {
    public static AuditLogResponse from(AuditLog log) {
        return new AuditLogResponse(
                log.getId(),
                log.getEventType(),
                log.getActorUsername(),
                log.getTargetUsername(),
                log.getIp(),
                log.getDetail(),
                log.getCreatedAt());
    }
}
