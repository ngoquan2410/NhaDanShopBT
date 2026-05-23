package com.example.nhadanshop.integration;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.context.TestPropertySource;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Postgres + Flyway chain smoke (Phase 6 gate): boots full application context against a real Postgres
 * instance via Testcontainers — not H2 ddl-auto-only. Validates recent slices ({@code V26} auth/loyalty,
 * {@code V27} shipping, {@code V28}–{@code V31} production string columns + diagnostics tables).
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.NONE)
@Testcontainers(disabledWithoutDocker = true)
@TestPropertySource(properties = {
        "spring.jpa.hibernate.ddl-auto=validate",
        "spring.flyway.enabled=true",
        "spring.flyway.validate-on-migrate=true",
        "jwt.secret=FlywayPostgresSmokeJwtSecret32CharsMinimum!!",
        "casso.webhook-secure-token=smoke-flyway",
        "ghn.token=",
        "ghn.shop-id=",
})
class FlywayPostgresMigrationSmokeIntegrationTest {

    @Container
    @SuppressWarnings("resource")
    static final PostgreSQLContainer<?> POSTGRES = new PostgreSQLContainer<>("postgres:16-alpine")
            .withDatabaseName("nhadanshop_flyway_smoke");

    @DynamicPropertySource
    static void dataSourceProps(DynamicPropertyRegistry registry) {
        registry.add("spring.datasource.url", POSTGRES::getJdbcUrl);
        registry.add("spring.datasource.username", POSTGRES::getUsername);
        registry.add("spring.datasource.password", POSTGRES::getPassword);
        registry.add("spring.datasource.driver-class-name", () -> "org.postgresql.Driver");
        registry.add("spring.jpa.properties.hibernate.dialect", () -> "org.hibernate.dialect.PostgreSQLDialect");
        registry.add("r2.public-url", () -> "http://127.0.0.1:9/r2-unused");
        registry.add("r2.account-id", () -> "");
        registry.add("r2.access-key-id", () -> "");
        registry.add("r2.secret-access-key", () -> "");
    }

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @Test
    @DisplayName("Flyway chain through latest scripts; V26 loyalty + shipping + password/GHN + recipe_code text")
    void flyway_applies_and_slice_migrations_leave_expected_schema() {
        String latestScript = jdbcTemplate.queryForObject(
                """
                        SELECT script FROM flyway_schema_history WHERE success = true
                        ORDER BY installed_rank DESC LIMIT 1""",
                String.class);
        assertThat(latestScript).isNotBlank();
        String versionSegment = latestScript.substring(1, latestScript.indexOf("__"));
        assertThat(Integer.parseInt(versionSegment)).isGreaterThanOrEqualTo(32);

        String recipeCodeSqlType = jdbcTemplate.queryForObject(
                """
                        SELECT data_type FROM information_schema.columns
                        WHERE table_schema = current_schema()
                          AND table_name = 'production_recipes'
                          AND column_name = 'recipe_code'""",
                String.class);
        assertThat(recipeCodeSqlType).isEqualToIgnoringCase("character varying");

        String orderNoSqlType = jdbcTemplate.queryForObject(
                """
                        SELECT data_type FROM information_schema.columns
                        WHERE table_schema = current_schema()
                          AND table_name = 'production_orders'
                          AND column_name = 'order_no'""",
                String.class);
        assertThat(orderNoSqlType).isEqualToIgnoringCase("character varying");

        Long loyaltyRows = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM loyalty_settings WHERE id = 1",
                Long.class);
        assertThat(loyaltyRows).isEqualTo(1L);

        assertColumnExists("shipping_settings", "zone_rules_json");
        assertColumnExists("shipping_settings", "parcel_defaults_json");
        assertColumnExists("password_reset_tokens", "token_hash");
        assertColumnExists("customer_point_transactions", "idempotency_key");
        assertColumnExists("ghn_quote_logs", "latency_ms");
        assertTimestampWithoutTimeZone("vouchers", "created_at");
        assertTimestampWithoutTimeZone("vouchers", "updated_at");
        assertTimestampWithoutTimeZone("vouchers", "start_at");
        assertTimestampWithoutTimeZone("vouchers", "end_at");
    }

    private void assertColumnExists(String table, String column) {
        Long c = jdbcTemplate.queryForObject(
                """
                        SELECT COUNT(*) FROM information_schema.columns
                        WHERE table_schema = current_schema() AND table_name = ? AND column_name = ?
                        """,
                Long.class,
                table,
                column);
        assertThat(c).isEqualTo(1L);
    }

    private void assertTimestampWithoutTimeZone(String table, String column) {
        String dataType = jdbcTemplate.queryForObject(
                """
                        SELECT data_type FROM information_schema.columns
                        WHERE table_schema = current_schema() AND table_name = ? AND column_name = ?
                        """,
                String.class,
                table,
                column);
        assertThat(dataType).isEqualToIgnoringCase("timestamp without time zone");
    }
}
