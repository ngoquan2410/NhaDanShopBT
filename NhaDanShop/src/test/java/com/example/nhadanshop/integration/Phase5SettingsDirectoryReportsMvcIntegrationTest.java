package com.example.nhadanshop.integration;

import com.example.nhadanshop.entity.Role;
import com.example.nhadanshop.entity.User;
import com.example.nhadanshop.repository.RoleRepository;
import com.example.nhadanshop.repository.UserRepository;
import com.example.nhadanshop.dto.ShippingAddressDto;
import com.example.nhadanshop.service.GhnShippingService;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.http.MediaType;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Phase 5 settings/integrations + admin directory + revenue/profit report auth matrix.
 */
@SpringBootTest
@AutoConfigureMockMvc
@Transactional
@TestPropertySource(properties = {
        "spring.datasource.url=jdbc:h2:mem:phase5_set;MODE=PostgreSQL;DATABASE_TO_LOWER=TRUE;DEFAULT_NULL_ORDERING=HIGH",
        "spring.datasource.username=sa",
        "spring.datasource.password=",
        "spring.datasource.driver-class-name=org.h2.Driver",
        "spring.jpa.hibernate.ddl-auto=create-drop",
        "spring.jpa.properties.hibernate.dialect=org.hibernate.dialect.H2Dialect",
        "spring.flyway.enabled=false",
        "jwt.secret=UnitTestJwtSecretValueAtLeast32CharactersLongForHmac!",
        "casso.webhook-secure-token=test-secure-token",
        "ghn.token=",
        "ghn.shop-id="
})
class Phase5SettingsDirectoryReportsMvcIntegrationTest {

    @Autowired
    private MockMvc mockMvc;
    @Autowired
    private ObjectMapper objectMapper;
    @Autowired
    private RoleRepository roleRepository;
    @Autowired
    private UserRepository userRepository;
    @Autowired
    private PasswordEncoder passwordEncoder;

    @MockBean
    private GhnShippingService ghnShippingService;

    private Role roleAdmin;
    private Role roleUser;

    @BeforeEach
    void seedRoles() {
        roleAdmin = roleRepository.findByName("ROLE_ADMIN").orElseGet(() -> {
            Role r = new Role();
            r.setName("ROLE_ADMIN");
            r.setDescription("A");
            return roleRepository.save(r);
        });
        roleUser = roleRepository.findByName("ROLE_USER").orElseGet(() -> {
            Role r = new Role();
            r.setName("ROLE_USER");
            r.setDescription("U");
            return roleRepository.save(r);
        });
        when(ghnShippingService.quote(
                any(ShippingAddressDto.class),
                any(),
                any(),
                any(),
                any(),
                any()
        )).thenThrow(new GhnShippingService.CarrierFailure("no_config", "GHN not configured for test", 2L));
    }

    private User saveUser(String username, String pwd, Role primary) {
        User u = new User();
        u.setUsername(username);
        u.setPassword(passwordEncoder.encode(pwd));
        u.setFullName("T");
        u.setActive(true);
        u.getRoles().add(primary);
        return userRepository.save(u);
    }

    private String loginAccess(String username, String password) throws Exception {
        String body = mockMvc.perform(post("/api/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"username\":\"" + username + "\",\"password\":\"" + password + "\"}"))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        return objectMapper.readTree(body).get("accessToken").asText();
    }

    private String uniq() {
        return Long.toUnsignedString(System.nanoTime());
    }

    @Test
    void ghn_quote_logs_admin_only() throws Exception {
        mockMvc.perform(get("/api/admin/ghn-quote-logs"))
                .andExpect(status().isForbidden());

        String u = "P5ADM-" + uniq();
        saveUser(u, "Adminpwd1!", roleAdmin);
        mockMvc.perform(get("/api/admin/ghn-quote-logs")
                        .header("Authorization", "Bearer " + loginAccess(u, "Adminpwd1!")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.content").isArray());
    }

    @Test
    void admin_users_forbidden_for_non_admin_suppliers_readable_when_logged_in() throws Exception {
        String adminU = "P5A-" + uniq();
        saveUser(adminU, "Adminpwd1!", roleAdmin);
        String adminTok = loginAccess(adminU, "Adminpwd1!");

        String plainU = "P5U-" + uniq();
        saveUser(plainU, "Secret12!ab", roleUser);
        String userTok = loginAccess(plainU, "Secret12!ab");

        mockMvc.perform(get("/api/admin/users").header("Authorization", "Bearer " + userTok))
                .andExpect(status().isForbidden());

        mockMvc.perform(get("/api/admin/users").header("Authorization", "Bearer " + adminTok))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.content").isArray());

        mockMvc.perform(get("/api/suppliers").header("Authorization", "Bearer " + userTok))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$").isArray());

        mockMvc.perform(get("/api/customers").header("Authorization", "Bearer " + userTok))
                .andExpect(status().isForbidden());
    }

    @Test
    void shipping_quote_zone_fallback_is_public_when_carrier_unconfigured() throws Exception {
        String quoteReq = """
                {"address":{"provinceCode":"01","provinceName":"HN","districtCode":"1","districtName":"Q","wardCode":"1","wardName":"P"},"subtotal":50000,"weightGrams":500}
                """;
        mockMvc.perform(post("/api/shipping/quote")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(quoteReq))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("quoted"));
    }

    @Test
    void reports_profit_requires_admin_revenue_total_authenticated() throws Exception {
        String plainU = "P5R-" + uniq();
        saveUser(plainU, "Secret12!ab", roleUser);
        String userTok = loginAccess(plainU, "Secret12!ab");

        String adminU = "P5RA-" + uniq();
        saveUser(adminU, "Adminpwd1!", roleAdmin);
        String adminTok = loginAccess(adminU, "Adminpwd1!");

        LocalDate from = LocalDate.of(2026, 1, 1);
        LocalDate to = LocalDate.of(2026, 1, 31);

        mockMvc.perform(get("/api/reports/profit")
                        .param("from", from.toString())
                        .param("to", to.toString())
                        .header("Authorization", "Bearer " + userTok))
                .andExpect(status().isForbidden());

        mockMvc.perform(get("/api/reports/profit")
                        .param("from", from.toString())
                        .param("to", to.toString())
                        .header("Authorization", "Bearer " + adminTok))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.totalRevenue").exists())
                .andExpect(jsonPath("$.totalProfit").exists());

        mockMvc.perform(get("/api/revenue/total")
                        .param("from", from.toString())
                        .param("to", to.toString())
                        .param("period", "daily")
                        .header("Authorization", "Bearer " + userTok))
                .andExpect(status().isOk());
    }
}
