package com.markly.backend.web.dto;

public record ImportUserRowResult(int rowNumber, String username, String status, String message) {
}
