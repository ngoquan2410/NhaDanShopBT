package com.example.nhadanshop.integration;

import com.example.nhadanshop.entity.Role;
import com.example.nhadanshop.entity.User;
import com.example.nhadanshop.repository.CustomerRepository;
import com.example.nhadanshop.repository.RoleRepository;
import com.example.nhadanshop.repository.UserRepository;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.annotation.Transactional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
@AutoConfigureMockMvc
@Transactional
@TestPropertySource(properties = {
        "spring.datasource.url=jdbc:h2:mem:auth_acct_mv;MODE=PostgreSQL;DATABASE_TO_LOWER=TRUE;DEFAULT_NULL_ORDERING=HIGH",
        "spring.datasource.username=sa",
        "spring.datasource.password=",
        "spring.datasource.driver-class-name=org.h2.Driver",
        "spring.jpa.hibernate.ddl-auto=create-drop",
        "spring.jpa.properties.hibernate.dialect=org.hibernate.dialect.H2Dialect",
        "spring.flyway.enabled=false",
        "jwt.secret=UnitTestJwtSecretValueAtLeast32CharactersLongForHmac!",
        "casso.webhook-secure-token=test-secure-token"
})
class AuthAccountMvcIntegrationTest {

    @Autowired MockMvc mockMvc;
    @Autowired ObjectMapper objectMapper;
    @Autowired RoleRepository roleRepository;
    @Autowired UserRepository userRepository;
    @Autowired CustomerRepository customerRepository;
    @Autowired PasswordEncoder passwordEncoder;

    private Role roleUser;
    private Role roleAdmin;

    @BeforeEach
    void seedRoles() {
        roleUser = roleRepository.findByName("ROLE_USER").orElseGet(() -> {
            Role r = newRole("ROLE_USER");
            return roleRepository.save(r);
        });
        roleAdmin = roleRepository.findByName("ROLE_ADMIN").orElseGet(() -> {
            Role r = newRole("ROLE_ADMIN");
            return roleRepository.save(r);
        });
    }

    private Role newRole(String name) {
        Role r = new Role();
        r.setName(name);
        r.setDescription(name);
        return r;
    }

    @Test
    void signup_creates_linked_customer_and_login_returns_tokens_roles_customerId() throws Exception {
        String u = "shopuser_" + System.nanoTime();
        mockMvc.perform(post("/api/auth/signup")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"username":"%s","password":"Secret12!ab","fullName":"Nguyen A"}
                                """.formatted(u)))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.accessToken").isString())
                .andExpect(jsonPath("$.refreshToken").isString())
                .andExpect(jsonPath("$.roles").isArray())
                .andExpect(jsonPath("$.customerId").isNumber());

        Login login = login(u, "Secret12!ab");

        mockMvc.perform(get("/api/auth/me").header("Authorization", "Bearer " + login.access))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.customerId").isNumber());

        mockMvc.perform(get("/api/account/me").header("Authorization", "Bearer " + login.access))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.username").value(u))
                .andExpect(jsonPath("$.customerId").isNumber());

        mockMvc.perform(put("/api/account/profile").header("Authorization", "Bearer " + login.access)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"fullName\":\"Nguyen B\",\"phone\":\"0901\",\"email\":\"b@example.com\",\"address\":\"HCM\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.fullName").value("Nguyen B"));

        mockMvc.perform(get("/api/customers"))
                .andExpect(status().isForbidden());

        mockMvc.perform(get("/api/customers").header("Authorization", "Bearer " + login.access))
                .andExpect(status().isForbidden());
    }

    @Test
    void refresh_rotates_and_old_refresh_rejected_logout_revokes() throws Exception {
        String u = "rot_" + System.nanoTime();
        mockMvc.perform(post("/api/auth/signup")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"username":"%s","password":"Secret12!ab"}
                                """.formatted(u)))
                .andExpect(status().isCreated());

        Login first = login(u, "Secret12!ab");

        JsonNode rotated = objectMapper.readTree(mockMvc.perform(post("/api/auth/refresh")
                                .contentType(MediaType.APPLICATION_JSON)
                                .content("{\"refreshToken\":\"" + first.refresh + "\"}"))
                        .andExpect(status().isOk())
                        .andReturn().getResponse().getContentAsString());

        String access2 = rotated.get("accessToken").asText();
        String refresh2 = rotated.get("refreshToken").asText();

        mockMvc.perform(post("/api/auth/refresh")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"refreshToken\":\"" + first.refresh + "\"}"))
                .andExpect(status().isUnauthorized());

        mockMvc.perform(post("/api/auth/logout")
                        .header("Authorization", "Bearer " + access2)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"refreshToken\":\"" + refresh2 + "\"}"))
                .andExpect(status().isNoContent());

        mockMvc.perform(post("/api/auth/refresh")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"refreshToken\":\"" + refresh2 + "\"}"))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void account_me_lazy_creates_customer_for_legacy_user_without_link() throws Exception {
        User u = new User();
        String name = "leg_" + System.nanoTime();
        u.setUsername(name);
        u.setPassword(passwordEncoder.encode("Adminpwd1!"));
        u.setFullName("Legacy Guy");
        u.setActive(true);
        u.getRoles().add(roleUser);
        u.setCustomer(null);
        userRepository.save(u);

        Login login = login(name, "Adminpwd1!");

        assertThat(customerRepository.count()).isZero();

        mockMvc.perform(get("/api/account/me").header("Authorization", "Bearer " + login.access))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.customerId").isNumber());

        assertThat(customerRepository.count()).isGreaterThanOrEqualTo(1);
    }

    @Test
    void role_admin_may_hit_customers_endpoint() throws Exception {
        User u = new User();
        String name = "adm_" + System.nanoTime();
        u.setUsername(name);
        u.setPassword(passwordEncoder.encode("Adminpwd1!"));
        u.setFullName("Admin Tester");
        u.setActive(true);
        u.getRoles().add(roleAdmin);
        userRepository.save(u);

        Login login = login(name, "Adminpwd1!");
        mockMvc.perform(get("/api/customers").header("Authorization", "Bearer " + login.access))
                .andExpect(status().isOk());
    }

    private Login login(String username, String password) throws Exception {
        String body = mockMvc.perform(post("/api/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"username\":\"" + username + "\",\"password\":\"" + password + "\"}"))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        JsonNode n = objectMapper.readTree(body);
        return new Login(n.get("accessToken").asText(), n.hasNonNull("refreshToken") ? n.get("refreshToken").asText() : null);
    }

    private record Login(String access, String refresh) {}
}
