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
                false, false, false);

        assertThat(response.customerId()).isEqualTo(42L);
        assertThat(response.roles()).containsExactly("ROLE_USER");
        assertThat(response.totpRequired()).isFalse();
    }

    @Test
    void login_response_roles_support_staff_and_customer_compatibility() {
        LoginResponse staff = new LoginResponse(
                "a", "r", "Bearer", 900,
                "staff1", "Staff One", Set.of("ROLE_STAFF"), null,
                false, false, false);
        LoginResponse customerCompat = new LoginResponse(
                "a2", "r2", "Bearer", 900,
                "c1", "Customer One", Set.of("ROLE_CUSTOMER"), 7L,
                false, false, false);

        assertThat(staff.roles()).contains("ROLE_STAFF");
        assertThat(customerCompat.roles()).contains("ROLE_CUSTOMER");
    }
}

