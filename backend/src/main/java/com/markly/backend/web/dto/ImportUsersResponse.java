package com.markly.backend.web.dto;

import java.util.List;

public record ImportUsersResponse(List<ImportUserRowResult> results, int created, int skipped) {
}
