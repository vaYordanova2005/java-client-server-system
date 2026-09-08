package com.markly.backend.web.dto;

import org.springframework.data.domain.Page;

import java.util.List;
import java.util.function.Function;

/**
 * Plain record instead of Spring HATEOAS's {@code PagedModel}, to match the
 * rest of this API's plain-record DTO style rather than introduce a second
 * response shape convention just for one endpoint.
 */
public record PageResponse<T>(List<T> content, int page, int size, long totalElements, int totalPages) {
    public static <S, T> PageResponse<T> from(Page<S> page, Function<S, T> mapper) {
        return new PageResponse<>(
                page.getContent().stream().map(mapper).toList(),
                page.getNumber(),
                page.getSize(),
                page.getTotalElements(),
                page.getTotalPages());
    }
}
