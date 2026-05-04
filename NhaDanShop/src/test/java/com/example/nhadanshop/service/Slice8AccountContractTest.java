package com.example.nhadanshop.service;

import com.example.nhadanshop.dto.AccountMeResponse;
import com.example.nhadanshop.dto.CustomerPointsSummaryResponse;
import org.junit.jupiter.api.Test;

import java.util.Set;

import static org.assertj.core.api.Assertions.assertThat;

class Slice8AccountContractTest {
    @Test
    void account_me_keeps_user_identity_separate_from_customer_loyalty_identity() {
        var points = new CustomerPointsSummaryResponse(7L, 1000L, 250L, 750L, 1500L, 500L);
        var me = new AccountMeResponse(3L, "login-user", "Nguyen A", Set.of("ROLE_USER"),
                7L, "KH007", "Nguyen A", "0900000000", "a@example.com", "HCM", points);

        assertThat(me.userId()).isEqualTo(3L);
        assertThat(me.customerId()).isEqualTo(7L);
        assertThat(me.points().availablePoints()).isEqualTo(750L);
        assertThat(me.roles()).contains("ROLE_USER");
    }
}

