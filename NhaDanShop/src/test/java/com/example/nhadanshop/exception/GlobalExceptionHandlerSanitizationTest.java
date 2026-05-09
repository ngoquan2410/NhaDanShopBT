package com.example.nhadanshop.exception;

import org.junit.jupiter.api.Test;
import org.springframework.dao.DataAccessResourceFailureException;
import org.springframework.http.ProblemDetail;

import static org.assertj.core.api.Assertions.assertThat;

class GlobalExceptionHandlerSanitizationTest {

    private final GlobalExceptionHandler handler = new GlobalExceptionHandler();

    @Test
    void data_access_errors_are_sanitized_for_client() {
        ProblemDetail pd = handler.handleDataAccessLayer(new DataAccessResourceFailureException(
                "JDBC exception executing SQL [select upper(bytea)]"));

        assertThat(pd.getDetail()).isEqualTo("Lỗi hệ thống. Vui lòng thử lại hoặc liên hệ quản trị.");
        assertNoLeak(pd);
    }

    @Test
    void generic_errors_are_sanitized_for_client() {
        ProblemDetail pd = handler.handleGeneral(new RuntimeException("constraint uk_users violated"));

        assertThat(pd.getDetail()).isEqualTo("Lỗi hệ thống. Vui lòng thử lại hoặc liên hệ quản trị.");
        assertNoLeak(pd);
    }

    private static void assertNoLeak(ProblemDetail pd) {
        String detail = pd.getDetail() == null ? "" : pd.getDetail().toLowerCase();
        assertThat(detail).doesNotContain("jdbc exception");
        assertThat(detail).doesNotContain("sql [");
        assertThat(detail).doesNotContain("select ");
        assertThat(detail).doesNotContain("upper(bytea)");
        assertThat(detail).doesNotContain("constraint");
        assertThat(detail).doesNotContain("org.");
        assertThat(detail).doesNotContain("exception");
    }
}
