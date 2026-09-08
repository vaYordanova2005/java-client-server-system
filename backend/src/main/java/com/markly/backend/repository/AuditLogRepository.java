package com.markly.backend.repository;

import com.markly.backend.domain.AuditLog;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface AuditLogRepository extends JpaRepository<AuditLog, Long> {

    /**
     * Every filter is optional (a null parameter matches everything) so the
     * admin audit-log screen can combine event type, actor, target, or a
     * single "anything about this person" search without a different query
     * per combination.
     */
    @Query("select a from AuditLog a where "
            + "(:eventType is null or a.eventType = :eventType) "
            + "and (:actorUsername is null or a.actorUsername = :actorUsername) "
            + "and (:targetUsername is null or a.targetUsername = :targetUsername) "
            + "and (:involving is null or a.actorUsername = :involving or a.targetUsername = :involving) "
            + "order by a.createdAt desc")
    Page<AuditLog> search(
            @Param("eventType") String eventType,
            @Param("actorUsername") String actorUsername,
            @Param("targetUsername") String targetUsername,
            @Param("involving") String involving,
            Pageable pageable);
}
