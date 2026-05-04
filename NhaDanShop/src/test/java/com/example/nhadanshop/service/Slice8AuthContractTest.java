package com.example.nhadanshop.service;

import com.example.nhadanshop.dto.LoginResponse;
import org.junit.jupiter.api.Test;

import java.util.Set;

import static org.assertj.core.api.Assertions.assertThat;

class Slice8AuthContractTest {
    @Test
    void login_response_exposes_linked_customer_id_for_unified_frontend_session() {
        LoginResponse response = new LoginResponse(
                "access", "refresh", "Bearer", 900,
                "user1", "User One", Set.of("ROLE_USER"), 42L,
                false, false);

        assertThat(response.customerId()).isEqualTo(42L);
        assertThat(response.roles()).containsExactly("ROLE_USER");
        assertThat(response.totpRequired()).isFalse();
    }
}

