package com.example.nhadanshop.integration;

import org.junit.jupiter.api.Test;
import org.springframework.core.io.ClassPathResource;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.jdbc.datasource.init.ScriptUtils;

import java.sql.Connection;
import java.sql.Timestamp;
import java.time.Instant;

import static org.assertj.core.api.Assertions.assertThat;

class ShippingLocalRulesMigrationTest {

    @Test
    void v39_seeds_default_local_mo_cay_only_for_empty_local_rules() throws Exception {
        DriverManagerDataSource dataSource = new DriverManagerDataSource(
                "jdbc:h2:mem:shipping_v39_" + System.nanoTime() + ";MODE=PostgreSQL;DATABASE_TO_LOWER=TRUE;DEFAULT_NULL_ORDERING=HIGH;DB_CLOSE_DELAY=-1",
                "sa",
                ""
        );
        dataSource.setDriverClassName("org.h2.Driver");
        JdbcTemplate jdbc = new JdbcTemplate(dataSource);
        jdbc.execute("""
                CREATE TABLE shipping_settings (
                    id BIGINT PRIMARY KEY,
                    zone_rules_json TEXT NOT NULL,
                    parcel_defaults_json TEXT NOT NULL,
                    updated_at TIMESTAMP NOT NULL
                )
                """);
        jdbc.update(
                "INSERT INTO shipping_settings (id, zone_rules_json, parcel_defaults_json, updated_at) VALUES (?, ?, ?, ?)",
                1L,
                "[]",
                "{}",
                Timestamp.from(Instant.now())
        );
        jdbc.update(
                "INSERT INTO shipping_settings (id, zone_rules_json, parcel_defaults_json, updated_at) VALUES (?, ?, ?, ?)",
                2L,
                "[]",
                "{}",
                Timestamp.from(Instant.now())
        );

        try (Connection connection = dataSource.getConnection()) {
            ScriptUtils.executeSqlScript(connection, new ClassPathResource("db/migration/V39__shipping_local_rules.sql"));
        }
        jdbc.update("UPDATE shipping_settings SET local_rules_json = ? WHERE id = 2", "[{\"enabled\":false,\"zoneCode\":\"CUSTOM\"}]");

        try (Connection connection = dataSource.getConnection()) {
            ScriptUtils.executeSqlScript(connection, new ClassPathResource("db/migration/V39__shipping_local_rules.sql"));
        }

        String seeded = jdbc.queryForObject("SELECT local_rules_json FROM shipping_settings WHERE id = 1", String.class);
        String preserved = jdbc.queryForObject("SELECT local_rules_json FROM shipping_settings WHERE id = 2", String.class);
        String nullable = jdbc.queryForObject(
                """
                        SELECT is_nullable FROM information_schema.columns
                        WHERE table_name = 'shipping_settings' AND column_name = 'local_rules_json'
                        """,
                String.class
        );

        assertThat(seeded).contains("LOCAL_MO_CAY")
                .contains("Mỏ Cày local delivery")
                .contains("\"fee\":0")
                .contains("\"min\":1")
                .contains("\"max\":1")
                .contains("Bến Tre")
                .contains("Vĩnh Long");
        assertThat(preserved).isEqualTo("[{\"enabled\":false,\"zoneCode\":\"CUSTOM\"}]");
        assertThat(nullable).isEqualToIgnoringCase("NO");
    }
}
