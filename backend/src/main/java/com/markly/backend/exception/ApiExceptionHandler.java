package com.markly.backend.exception;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.HttpStatusCode;
import org.springframework.http.ProblemDetail;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.authentication.BadCredentialsException;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.context.request.WebRequest;
import org.springframework.web.multipart.MaxUploadSizeExceededException;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.web.servlet.mvc.method.annotation.ResponseEntityExceptionHandler;

/**
 * Extends {@link ResponseEntityExceptionHandler} so framework-level cases it
 * already handles correctly — 404 (NoResourceFoundException), 405
 * (HttpRequestMethodNotSupportedException), malformed JSON, etc. — keep their
 * real status codes instead of falling through to the {@code Exception}
 * catch-all below. Only {@link #handleMethodArgumentNotValid} is overridden,
 * to keep our {@link ApiError} response shape for validation errors; adding
 * a separate {@code @ExceptionHandler(MethodArgumentNotValidException.class)}
 * method instead would collide with the base class's own mapping for that
 * exact type and fail at startup with an "Ambiguous @ExceptionHandler" error.
 *
 * <p>The base class answers with RFC 9457 {@link ProblemDetail} bodies, which
 * are shaped differently from our {@link ApiError} ({@code detail}/{@code title}
 * vs {@code message}). {@link #createResponseEntity} — the single funnel every
 * inherited handler goes through — converts them, so the API only ever emits
 * one error shape and the frontend can read {@code message} unconditionally.
 */
@RestControllerAdvice
public class ApiExceptionHandler extends ResponseEntityExceptionHandler {

    private static final Logger log = LoggerFactory.getLogger(ApiExceptionHandler.class);

    private static final String UNEXPECTED_MESSAGE = "Възникна неочаквана грешка. Опитайте по-късно.";

    @Override
    protected ResponseEntity<Object> createResponseEntity(
            Object body, HttpHeaders headers, HttpStatusCode statusCode, WebRequest request) {
        Object payload = body instanceof ProblemDetail ? new ApiError(messageFor(statusCode)) : body;
        return super.createResponseEntity(payload, headers, statusCode, request);
    }

    /**
     * Framework {@code ProblemDetail} texts are English and describe internals
     * ("No static resource api/...", "Failed to read request"), so they are
     * replaced with the user-facing wording used everywhere else.
     */
    private String messageFor(HttpStatusCode statusCode) {
        if (statusCode.isSameCodeAs(HttpStatus.NOT_FOUND)) {
            return "Ресурсът не е намерен";
        }
        if (statusCode.isSameCodeAs(HttpStatus.METHOD_NOT_ALLOWED)) {
            return "Методът не се поддържа за този адрес";
        }
        if (statusCode.is4xxClientError()) {
            return "Невалидна заявка";
        }
        return UNEXPECTED_MESSAGE;
    }

    @Override
    protected ResponseEntity<Object> handleMethodArgumentNotValid(
            MethodArgumentNotValidException ex, HttpHeaders headers, HttpStatusCode status, WebRequest request) {
        String message = ex.getBindingResult().getFieldErrors().stream()
                .findFirst()
                .map(error -> error.getDefaultMessage())
                .orElse("Невалидна заявка");
        return ResponseEntity.badRequest().body(new ApiError(message));
    }

    @ExceptionHandler(IllegalArgumentException.class)
    public ResponseEntity<ApiError> handleIllegalArgument(IllegalArgumentException ex) {
        return ResponseEntity.badRequest().body(new ApiError(ex.getMessage()));
    }

    @ExceptionHandler(BadCredentialsException.class)
    public ResponseEntity<ApiError> handleBadCredentials(BadCredentialsException ex) {
        return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body(new ApiError("Невалидно потребителско име или парола"));
    }

    @ExceptionHandler(AccessDeniedException.class)
    public ResponseEntity<ApiError> handleAccessDenied(AccessDeniedException ex) {
        return ResponseEntity.status(HttpStatus.FORBIDDEN).body(new ApiError("Нямате достъп за това действие"));
    }

    /**
     * The base class already maps this exception (like
     * {@link #handleMethodArgumentNotValid}, a plain
     * {@code @ExceptionHandler(MaxUploadSizeExceededException.class)} method
     * would collide with its existing mapping and fail at startup with an
     * "Ambiguous @ExceptionHandler" error), but its default body is an
     * English {@code ProblemDetail}. Overriding it is what turns a CSV
     * import over the configured limit (see {@code application.yml}'s
     * {@code spring.servlet.multipart} settings) into a friendly 400
     * instead of a raw {@code MaxUploadSizeExceededException} — a 500 the
     * admin can't act on.
     */
    @Override
    protected ResponseEntity<Object> handleMaxUploadSizeExceededException(
            MaxUploadSizeExceededException ex, HttpHeaders headers, HttpStatusCode status, WebRequest request) {
        return ResponseEntity.badRequest().body(new ApiError("Файлът е твърде голям"));
    }

    @ExceptionHandler(ResponseStatusException.class)
    public ResponseEntity<ApiError> handleResponseStatus(ResponseStatusException ex) {
        return ResponseEntity.status(ex.getStatusCode()).body(new ApiError(ex.getReason()));
    }

    @ExceptionHandler(Exception.class)
    public ResponseEntity<ApiError> handleUnexpected(Exception ex) {
        log.error("Unhandled exception", ex);
        return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).body(new ApiError(UNEXPECTED_MESSAGE));
    }
}
