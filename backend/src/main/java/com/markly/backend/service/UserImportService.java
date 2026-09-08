package com.markly.backend.service;

import com.markly.backend.domain.Role;
import com.markly.backend.domain.User;
import com.markly.backend.repository.UserRepository;
import com.markly.backend.web.dto.ImportUserRowResult;
import com.markly.backend.web.dto.ImportUsersResponse;
import org.apache.commons.csv.CSVFormat;
import org.apache.commons.csv.CSVParser;
import org.apache.commons.csv.CSVRecord;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;

import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.Reader;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;

/**
 * CSV bulk import for admin-created accounts: {@code role,username,password}
 * columns, matching {@code CreateUserRequest} exactly — profile fields are
 * out of scope for v1, a separate follow-up. Each row is validated and saved
 * independently; one bad row (a typo, a duplicate username) is recorded as
 * skipped rather than aborting rows already processed, since an admin
 * importing a large roster shouldn't lose the other 29 good rows over 1 bad
 * one.
 */
@Service
public class UserImportService {

    private static final List<String> EXPECTED_HEADERS = List.of("role", "username", "password");

    private final UserRepository userRepository;
    private final UserValidationService userValidationService;
    private final PasswordEncoder passwordEncoder;

    public UserImportService(
            UserRepository userRepository, UserValidationService userValidationService, PasswordEncoder passwordEncoder) {
        this.userRepository = userRepository;
        this.userValidationService = userValidationService;
        this.passwordEncoder = passwordEncoder;
    }

    public ImportUsersResponse importUsers(InputStream input) throws IOException {
        List<ImportUserRowResult> results = new ArrayList<>();
        int created = 0;
        int skipped = 0;

        CSVFormat format = CSVFormat.DEFAULT.builder()
                .setHeader()
                .setSkipHeaderRecord(true)
                .setIgnoreSurroundingSpaces(true)
                .setTrim(true)
                .get();

        try (Reader reader = stripBomAndDecode(input); CSVParser parser = CSVParser.parse(reader, format)) {
            List<String> headers = parser.getHeaderNames().stream().map(h -> h.toLowerCase(Locale.ROOT)).toList();
            if (!headers.containsAll(EXPECTED_HEADERS)) {
                throw new IllegalArgumentException("Файлът трябва да съдържа колони role, username, password");
            }

            int rowNumber = 0;
            for (CSVRecord record : parser) {
                rowNumber++;
                String roleValue = value(record, "role");
                String username = value(record, "username");
                String password = value(record, "password");
                try {
                    Role role = Role.valueOf(roleValue.toUpperCase(Locale.ROOT));
                    userValidationService.validate(role, username, password);
                    if (userRepository.existsByUsernameIgnoreCase(username)) {
                        throw new IllegalArgumentException("Потребителското име вече съществува");
                    }
                    userRepository.save(new User(username, passwordEncoder.encode(password), role));
                    results.add(new ImportUserRowResult(rowNumber, username, "CREATED", null));
                    created++;
                } catch (IllegalArgumentException ex) {
                    results.add(new ImportUserRowResult(rowNumber, username, "SKIPPED", ex.getMessage()));
                    skipped++;
                }
            }
        }

        return new ImportUsersResponse(results, created, skipped);
    }

    /**
     * Case-insensitive header lookup: {@code CSVRecord.get(String)} is
     * case-sensitive, so a header of "Role" would otherwise not match "role".
     */
    private String value(CSVRecord record, String header) {
        for (String key : record.toMap().keySet()) {
            if (key.equalsIgnoreCase(header)) {
                return record.get(key).trim();
            }
        }
        return "";
    }

    /**
     * Excel saves UTF-8 CSVs with a leading byte-order mark, which would
     * otherwise corrupt the first header name into {@code "﻿role"} and
     * break the header-matching check above.
     */
    private Reader stripBomAndDecode(InputStream input) throws IOException {
        byte[] bytes = input.readAllBytes();
        int offset = 0;
        if (bytes.length >= 3 && (bytes[0] & 0xFF) == 0xEF && (bytes[1] & 0xFF) == 0xBB && (bytes[2] & 0xFF) == 0xBF) {
            offset = 3;
        }
        return new InputStreamReader(new ByteArrayInputStream(bytes, offset, bytes.length - offset), StandardCharsets.UTF_8);
    }
}
