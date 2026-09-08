package com.markly.backend.security;

import com.markly.backend.exception.ApiError;
import io.jsonwebtoken.Claims;
import io.jsonwebtoken.JwtException;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.http.MediaType;
import org.springframework.lang.NonNull;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.core.userdetails.UsernameNotFoundException;
import org.springframework.security.web.authentication.WebAuthenticationDetailsSource;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;
import tools.jackson.databind.ObjectMapper;

import java.io.IOException;
import java.util.Set;

@Component
public class JwtAuthenticationFilter extends OncePerRequestFilter {

    /** Methods that cannot change anything and therefore need no CSRF token. */
    private static final Set<String> SAFE_METHODS = Set.of("GET", "HEAD", "OPTIONS");

    private final JwtService jwtService;
    private final AppUserDetailsService userDetailsService;
    private final AuthCookieService authCookieService;
    private final ObjectMapper objectMapper;

    public JwtAuthenticationFilter(
            JwtService jwtService,
            AppUserDetailsService userDetailsService,
            AuthCookieService authCookieService,
            ObjectMapper objectMapper) {
        this.jwtService = jwtService;
        this.userDetailsService = userDetailsService;
        this.authCookieService = authCookieService;
        this.objectMapper = objectMapper;
    }

    /**
     * A leftover cookie from a previous session must not stop someone from
     * logging in again (it would fail the CSRF check below with a token the
     * SPA no longer has), so the login endpoint authenticates purely from the
     * credentials in the body.
     */
    @Override
    protected boolean shouldNotFilter(HttpServletRequest request) {
        return request.getRequestURI().endsWith("/api/auth/login");
    }

    @Override
    protected void doFilterInternal(
            @NonNull HttpServletRequest request,
            @NonNull HttpServletResponse response,
            @NonNull FilterChain filterChain) throws ServletException, IOException {

        String token = authCookieService.readToken(request).orElse(null);
        if (token == null) {
            filterChain.doFilter(request, response);
            return;
        }

        Claims claims;
        try {
            claims = jwtService.parseClaims(token);
        } catch (JwtException | IllegalArgumentException ex) {
            SecurityContextHolder.clearContext();
            reject(response, HttpServletResponse.SC_UNAUTHORIZED, "Сесията е изтекла. Влезте отново.");
            return;
        }

        // The cookie travels on every request the browser makes, including
        // ones triggered by another site, so a state-changing call must also
        // carry the token only our own SPA can know.
        if (!SAFE_METHODS.contains(request.getMethod())
                && !jwtService.csrfTokenMatches(claims, request.getHeader(AuthCookieService.CSRF_HEADER))) {
            SecurityContextHolder.clearContext();
            reject(response, HttpServletResponse.SC_FORBIDDEN, "Невалиден CSRF токен");
            return;
        }

        String username = claims.getSubject();
        if (username == null || SecurityContextHolder.getContext().getAuthentication() != null) {
            filterChain.doFilter(request, response);
            return;
        }

        AppUserPrincipal principal;
        try {
            principal = (AppUserPrincipal) userDetailsService.loadUserByUsername(username);
        } catch (UsernameNotFoundException ex) {
            // The account was deleted while the token was still valid; without
            // this the exception would escape the filter chain as a 500.
            SecurityContextHolder.clearContext();
            reject(response, HttpServletResponse.SC_UNAUTHORIZED, "Сесията вече не е валидна. Влезте отново.");
            return;
        }

        // A JWT cannot be withdrawn once issued, so revocation is expressed as
        // a version the user row carries: logout, deactivation and unlock all
        // bump it, which retires every token issued before that point.
        Integer tokenVersion = claims.get(JwtService.TOKEN_VERSION_CLAIM, Integer.class);
        if (tokenVersion == null || tokenVersion != principal.getUser().getTokenVersion()
                || !principal.isEnabled() || !principal.isAccountNonLocked()) {
            SecurityContextHolder.clearContext();
            reject(response, HttpServletResponse.SC_UNAUTHORIZED, "Сесията вече не е валидна. Влезте отново.");
            return;
        }

        // A demo account may read everything its role can, but nothing it does may
        // persist; logout is a POST too but isn't a data mutation, so it stays allowed.
        if (principal.getUser().isDemo()
                && !SAFE_METHODS.contains(request.getMethod())
                && !request.getRequestURI().endsWith("/api/auth/logout")) {
            reject(response, HttpServletResponse.SC_FORBIDDEN,
                    "Това е демо акаунт — само преглед, действието не е разрешено.");
            return;
        }

        var authToken = new UsernamePasswordAuthenticationToken(
                principal, null, principal.getAuthorities());
        authToken.setDetails(new WebAuthenticationDetailsSource().buildDetails(request));
        SecurityContextHolder.getContext().setAuthentication(authToken);

        filterChain.doFilter(request, response);
    }

    private void reject(HttpServletResponse response, int status, String message) throws IOException {
        response.setStatus(status);
        response.setContentType(MediaType.APPLICATION_JSON_VALUE);
        response.setCharacterEncoding("UTF-8");
        objectMapper.writeValue(response.getWriter(), new ApiError(message));
    }
}
