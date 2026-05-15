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
    void change_password_success_revokes_refresh_and_old_password_fails() throws Exception {
        String u = "chgpw_" + System.nanoTime();
        mockMvc.perform(post("/api/auth/signup")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"username":"%s","password":"Secret12!ab"}
                                """.formatted(u)))
                .andExpect(status().isCreated());

        Login first = login(u, "Secret12!ab");

        mockMvc.perform(post("/api/auth/change-password")
                        .header("Authorization", "Bearer " + first.access)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"currentPassword":"Secret12!ab","newPassword":"NewSecret9!xy","confirmPassword":"NewSecret9!xy"}
                                """))
                .andExpect(status().isNoContent());

        mockMvc.perform(post("/api/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"username\":\"" + u + "\",\"password\":\"Secret12!ab\"}"))
                .andExpect(status().isUnauthorized());

        Login after = login(u, "NewSecret9!xy");

        mockMvc.perform(post("/api/auth/refresh")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"refreshToken\":\"" + first.refresh + "\"}"))
                .andExpect(status().isUnauthorized());

        mockMvc.perform(get("/api/auth/me").header("Authorization", "Bearer " + after.access))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.username").value(u));
    }

    @Test
    void change_password_wrong_current_returns_400() throws Exception {
        String u = "chgpw_bad_" + System.nanoTime();
        mockMvc.perform(post("/api/auth/signup")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"username":"%s","password":"Secret12!ab"}
                                """.formatted(u)))
                .andExpect(status().isCreated());
        Login login = login(u, "Secret12!ab");

        mockMvc.perform(post("/api/auth/change-password")
                        .header("Authorization", "Bearer " + login.access)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"currentPassword":"wrong","newPassword":"NewSecret9!xy","confirmPassword":"NewSecret9!xy"}
                                """))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.detail").value("Mật khẩu hiện tại không đúng"));
    }

    @Test
    void login_wrong_password_still_returns_401() throws Exception {
        String u = "login_bad_" + System.nanoTime();
        mockMvc.perform(post("/api/auth/signup")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"username":"%s","password":"Secret12!ab"}
                                """.formatted(u)))
                .andExpect(status().isCreated());

        mockMvc.perform(post("/api/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"username\":\"" + u + "\",\"password\":\"wrong-password\"}"))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void change_password_mismatch_and_same_as_old_return_400() throws Exception {
        String u = "chgpw_val_" + System.nanoTime();
        mockMvc.perform(post("/api/auth/signup")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"username":"%s","password":"Secret12!ab"}
                                """.formatted(u)))
                .andExpect(status().isCreated());
        Login login = login(u, "Secret12!ab");

        mockMvc.perform(post("/api/auth/change-password")
                        .header("Authorization", "Bearer " + login.access)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"currentPassword":"Secret12!ab","newPassword":"NewSecret9!xy","confirmPassword":"Mismatch9!xy"}
                                """))
                .andExpect(status().isBadRequest());

        mockMvc.perform(post("/api/auth/change-password")
                        .header("Authorization", "Bearer " + login.access)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"currentPassword":"Secret12!ab","newPassword":"Secret12!ab","confirmPassword":"Secret12!ab"}
                                """))
                .andExpect(status().isBadRequest());
    }

    @Test
    void admin_reset_password_other_user_revokes_refresh_self_reset_forbidden() throws Exception {
        Role roleStaff = roleRepository.findByName("ROLE_STAFF").orElseGet(() -> {
            Role r = newRole("ROLE_STAFF");
            return roleRepository.save(r);
        });

        String adminName = "adm_pw_" + System.nanoTime();
        User admin = new User();
        admin.setUsername(adminName);
        admin.setPassword(passwordEncoder.encode("Adminpwd1!"));
        admin.setFullName("Admin PW");
        admin.setActive(true);
        admin.getRoles().add(roleAdmin);
        userRepository.save(admin);

        String staffName = "staff_pw_" + System.nanoTime();
        User staff = new User();
        staff.setUsername(staffName);
        staff.setPassword(passwordEncoder.encode("Staffpwd1!"));
        staff.setFullName("Staff PW");
        staff.setActive(true);
        staff.getRoles().add(roleStaff);
        userRepository.save(staff);

        Login adminLogin = login(adminName, "Adminpwd1!");
        Login staffLogin = login(staffName, "Staffpwd1!");

        mockMvc.perform(post("/api/admin/users/" + staff.getId() + "/reset-password")
                        .header("Authorization", "Bearer " + adminLogin.access)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"newPassword":"ResetStaff9!z","confirmPassword":"ResetStaff9!z"}
                                """))
                .andExpect(status().isNoContent());

        mockMvc.perform(post("/api/auth/refresh")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"refreshToken\":\"" + staffLogin.refresh + "\"}"))
                .andExpect(status().isUnauthorized());

        Login staffAfterReset = login(staffName, "ResetStaff9!z");

        mockMvc.perform(post("/api/admin/users/" + admin.getId() + "/reset-password")
                        .header("Authorization", "Bearer " + adminLogin.access)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"newPassword":"NewAdmin9!z","confirmPassword":"NewAdmin9!z"}
                                """))
                .andExpect(status().isBadRequest());

        mockMvc.perform(post("/api/admin/users/" + admin.getId() + "/reset-password")
                        .header("Authorization", "Bearer " + staffAfterReset.access)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"newPassword":"HackerStaff9!z","confirmPassword":"HackerStaff9!z"}
                                """))
                .andExpect(status().isForbidden());
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
