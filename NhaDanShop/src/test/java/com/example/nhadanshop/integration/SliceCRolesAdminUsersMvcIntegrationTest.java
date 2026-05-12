package com.example.nhadanshop.integration;

import com.example.nhadanshop.entity.Role;
import com.example.nhadanshop.entity.User;
import com.example.nhadanshop.repository.RoleRepository;
import com.example.nhadanshop.repository.UserRepository;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.annotation.Transactional;

import java.util.Set;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
@AutoConfigureMockMvc
@Transactional
@TestPropertySource(properties = {
        "spring.datasource.url=jdbc:h2:mem:slice_c_roles_users;MODE=PostgreSQL;DATABASE_TO_LOWER=TRUE;DEFAULT_NULL_ORDERING=HIGH",
        "spring.datasource.username=sa",
        "spring.datasource.password=",
        "spring.datasource.driver-class-name=org.h2.Driver",
        "spring.jpa.hibernate.ddl-auto=create-drop",
        "spring.jpa.properties.hibernate.dialect=org.hibernate.dialect.H2Dialect",
        "spring.flyway.enabled=false",
        "jwt.secret=UnitTestJwtSecretValueAtLeast32CharactersLongForHmac!"
})
class SliceCRolesAdminUsersMvcIntegrationTest {

    @Autowired
    MockMvc mockMvc;
    @Autowired
    ObjectMapper objectMapper;
    @Autowired
    RoleRepository roleRepository;
    @Autowired
    UserRepository userRepository;

    @BeforeEach
    void seedRoles() {
        ensureRole("ROLE_ADMIN", "Admin role");
        ensureRole("ROLE_STAFF", "Staff role");
        ensureRole("ROLE_USER", "Customer/user role");
        ensureRole("ROLE_CUSTOMER", "Customer compatibility role");
    }

    @Test
    void admin_can_list_assignable_roles_only() throws Exception {
        mockMvc.perform(get("/api/admin/roles").with(user("admin").roles("ADMIN")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[?(@.name=='ROLE_ADMIN')]").exists())
                .andExpect(jsonPath("$[?(@.name=='ROLE_STAFF')]").exists())
                .andExpect(jsonPath("$[?(@.name=='ROLE_USER')]").doesNotExist())
                .andExpect(jsonPath("$[?(@.name=='ROLE_CUSTOMER')]").doesNotExist());
    }

    @Test
    void staff_customer_anonymous_cannot_list_admin_roles() throws Exception {
        mockMvc.perform(get("/api/admin/roles").with(user("staff").roles("STAFF")))
                .andExpect(status().isForbidden());

        mockMvc.perform(get("/api/admin/roles").with(user("customer").roles("USER")))
                .andExpect(status().isForbidden());

        int anonStatus = mockMvc.perform(get("/api/admin/roles"))
                .andReturn().getResponse().getStatus();
        assertThat(anonStatus == 401 || anonStatus == 403).isTrue();
    }

    @Test
    void admin_create_staff_persists_role_staff_not_role_user() throws Exception {
        String username = "slicec_staff_" + System.nanoTime();
        mockMvc.perform(post("/api/admin/users")
                        .with(user("admin").roles("ADMIN"))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "username": "%s",
                                  "password": "Secret12!ab",
                                  "fullName": "Slice C Staff",
                                  "roles": ["ROLE_STAFF"]
                                }
                                """.formatted(username)))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.roles[?(@=='ROLE_STAFF')]").exists())
                .andExpect(jsonPath("$.roles[?(@=='ROLE_USER')]").doesNotExist());

        User saved = userRepository.findByUsername(username).orElseThrow();
        Set<String> roleNames = saved.getRoles().stream().map(Role::getName).collect(java.util.stream.Collectors.toSet());
        assertThat(roleNames).contains("ROLE_STAFF");
        assertThat(roleNames).doesNotContain("ROLE_USER");
    }

    @Test
    void admin_create_admin_persists_role_admin() throws Exception {
        String username = "slicec_admin_" + System.nanoTime();
        mockMvc.perform(post("/api/admin/users")
                        .with(user("admin").roles("ADMIN"))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "username": "%s",
                                  "password": "Secret12!ab",
                                  "fullName": "Slice C Admin",
                                  "roles": ["ROLE_ADMIN"]
                                }
                                """.formatted(username)))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.roles[?(@=='ROLE_ADMIN')]").exists());

        User saved = userRepository.findByUsername(username).orElseThrow();
        Set<String> roleNames = saved.getRoles().stream().map(Role::getName).collect(java.util.stream.Collectors.toSet());
        assertThat(roleNames).contains("ROLE_ADMIN");
    }

    @Test
    void customer_cannot_access_admin_users_api() throws Exception {
        mockMvc.perform(get("/api/admin/users").with(user("customer").roles("USER")))
                .andExpect(status().isForbidden());
    }

    private void ensureRole(String name, String description) {
        roleRepository.findByName(name).orElseGet(() -> {
            Role role = new Role();
            role.setName(name);
            role.setDescription(description);
            return roleRepository.save(role);
        });
    }
}
