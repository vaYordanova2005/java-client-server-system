package com.markly.backend.security;

import com.markly.backend.domain.User;
import com.markly.backend.repository.UserRepository;
import com.markly.backend.service.AuditLogService;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Duration;
import java.time.Instant;

/**
 * Per-account half of the brute-force defence: counts consecutive failed
 * logins and locks the account for {@link #LOCK_DURATION} once
 * {@link #MAX_FAILED_ATTEMPTS} is reached. The per-IP half — which stops an
 * attacker from spreading the same password over many accounts — is
 * {@link LoginRateLimitFilter}.
 *
 * <p>Also the single place where authentication outcomes are audited (via
 * {@link AuditLogService}); before this, a failed login left no trace at
 * all, so an attack in progress was invisible.
 */
@Service
public class LoginAttemptService {

    public static final int MAX_FAILED_ATTEMPTS = 5;
    public static final Duration LOCK_DURATION = Duration.ofMinutes(15);

    private final UserRepository userRepository;
    private final AuditLogService auditLogService;

    public LoginAttemptService(UserRepository userRepository, AuditLogService auditLogService) {
        this.userRepository = userRepository;
        this.auditLogService = auditLogService;
    }

    @Transactional
    public void onFailure(String username, String clientIp, String reason) {
        User user = userRepository.findByUsernameIgnoreCase(username).orElse(null);
        if (user == null) {
            // Deliberately not created or tracked per-username: an unknown
            // username is already covered by the per-IP limit, and keeping
            // state for it would let anyone fill the table.
            auditLogService.record("LOGIN_FAILURE", username, null, clientIp, "reason=UNKNOWN_USER");
            return;
        }

        if (user.isDemo()) {
            // The demo password is public by design (see README), so counting
            // failures here would let anyone lock the account for every other
            // visitor. The per-IP limit in LoginRateLimitFilter still applies.
            auditLogService.record("LOGIN_FAILURE", user.getUsername(), null, clientIp,
                    "reason=" + reason + " (demo account, not counted toward lockout)");
            return;
        }

        int attempts = user.getFailedLoginAttempts() + 1;
        user.setFailedLoginAttempts(attempts);
        if (attempts >= MAX_FAILED_ATTEMPTS) {
            user.setLockedUntil(Instant.now().plus(LOCK_DURATION));
            user.setFailedLoginAttempts(0);
            auditLogService.record("ACCOUNT_LOCKED", user.getUsername(), null, clientIp,
                    "until=" + user.getLockedUntil() + " after " + MAX_FAILED_ATTEMPTS + " failed attempts");
        } else {
            auditLogService.record("LOGIN_FAILURE", user.getUsername(), null, clientIp,
                    "reason=" + reason + " attempt=" + attempts + "/" + MAX_FAILED_ATTEMPTS);
        }
        userRepository.save(user);
    }

    @Transactional
    public void onSuccess(String username, String clientIp) {
        userRepository.findByUsernameIgnoreCase(username).ifPresent(user -> {
            auditLogService.record("LOGIN_SUCCESS", user.getUsername(), null, clientIp, null);
            if (user.getFailedLoginAttempts() != 0 || user.getLockedUntil() != null) {
                user.setFailedLoginAttempts(0);
                user.setLockedUntil(null);
                userRepository.save(user);
            }
        });
    }

    public void onBlocked(String username, String clientIp, String reason) {
        auditLogService.record("LOGIN_BLOCKED", username, null, clientIp, "reason=" + reason);
    }
}
