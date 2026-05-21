package com.example.nhadanshop.integration;

import com.example.nhadanshop.dto.ShippingAddressDto;
import com.example.nhadanshop.entity.ShippingSettingsRecord;
import com.example.nhadanshop.entity.Role;
import com.example.nhadanshop.entity.User;
import com.example.nhadanshop.repository.RoleRepository;
import com.example.nhadanshop.repository.ShippingSettingsRepository;
import com.example.nhadanshop.repository.UserRepository;
import com.example.nhadanshop.service.GhnShippingService;
import com.fasterxml.jackson.databind.JsonNode;
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

import java.time.Instant;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.Mockito.when;
import static org.mockito.Mockito.clearInvocations;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
@AutoConfigureMockMvc
@Transactional
@TestPropertySource(properties = {
        "spring.datasource.url=jdbc:h2:mem:slice8b_store_ship;MODE=PostgreSQL;DATABASE_TO_LOWER=TRUE;DEFAULT_NULL_ORDERING=HIGH",
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
class Slice8bStoreShippingMvcIntegrationTest {

    @Autowired
    private MockMvc mockMvc;
    @Autowired
    private ObjectMapper objectMapper;
    @Autowired
    private RoleRepository roleRepository;
    @Autowired
    private UserRepository userRepository;
    @Autowired
    private ShippingSettingsRepository shippingSettingsRepository;
    @Autowired
    private PasswordEncoder passwordEncoder;

    @MockBean
    private GhnShippingService ghnShippingService;

    private Role roleUser;
    private Role roleAdmin;

    @BeforeEach
    void seedRolesAndStubGhn() {
        roleUser = roleRepository.findByName("ROLE_USER").orElseGet(() -> {
            Role r = new Role();
            r.setName("ROLE_USER");
            r.setDescription("U");
            return roleRepository.save(r);
        });
        roleAdmin = roleRepository.findByName("ROLE_ADMIN").orElseGet(() -> {
            Role r = new Role();
            r.setName("ROLE_ADMIN");
            r.setDescription("A");
            return roleRepository.save(r);
        });
        when(ghnShippingService.quote(
                any(ShippingAddressDto.class),
                any(),
                anyInt(),
                anyInt(),
                anyInt(),
                any()
        )).thenThrow(new GhnShippingService.CarrierFailure("no_config", "GHN not configured for test", 2L));
    }

    @Test
    void store_payment_settings_put_requires_admin() throws Exception {
        mockMvc.perform(put("/api/store/payment-settings")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{}"))
                .andExpect(status().isForbidden());

        User user = newUser("u_" + System.nanoTime(), roleUser);
        Login u = login(user.getUsername(), "Secret12!ab");

        mockMvc.perform(put("/api/store/payment-settings")
                        .header("Authorization", "Bearer " + u.access)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"qrEnabled\":true,\"vietQrBankCode\":\"VCB\",\"accountNumber\":\"1\",\"accountName\":\"X\"}"))
                .andExpect(status().isForbidden());

        User admin = newUser("a_" + System.nanoTime(), roleAdmin);
        Login a = login(admin.getUsername(), "Secret12!ab");

        mockMvc.perform(put("/api/store/payment-settings")
                        .header("Authorization", "Bearer " + a.access)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"qrEnabled\":true,\"vietQrBankCode\":\"VCB\",\"accountNumber\":\"123\",\"accountName\":\"Shop\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.accountNumber").value("123"));

        mockMvc.perform(get("/api/store/payment-settings"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.accountNumber").value("123"));
    }

    @Test
    void shipping_settings_get_put_admin_only_and_quote_uses_saved_zones() throws Exception {
        mockMvc.perform(get("/api/shipping/settings"))
                .andExpect(status().isForbidden());

        User user = newUser("ship_u_" + System.nanoTime(), roleUser);
        Login u = login(user.getUsername(), "Secret12!ab");
        mockMvc.perform(get("/api/shipping/settings").header("Authorization", "Bearer " + u.access))
                .andExpect(status().isForbidden());

        User admin = newUser("ship_a_" + System.nanoTime(), roleAdmin);
        Login a = login(admin.getUsername(), "Secret12!ab");

        String body = """
                {"zoneRules":[{"zoneCode":"ZX","label":"Test","baseFee":77777,"freeShipThreshold":100000,"etaDays":{"min":1,"max":2},"provinceCodes":["48"]},{"zoneCode":"ZZ","label":"Rest","baseFee":1000,"freeShipThreshold":null,"etaDays":{"min":1,"max":2},"provinceCodes":["*"]}],"parcelDefaults":{"length":12,"width":12,"height":12,"weightGrams":600,"declaredValueMode":"none","declaredValueFixed":null}}
                """;

        mockMvc.perform(put("/api/shipping/settings")
                        .header("Authorization", "Bearer " + a.access)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.zoneRules[0].zoneCode").value("ZX"));

        mockMvc.perform(get("/api/shipping/settings").header("Authorization", "Bearer " + a.access))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.zoneRules[0].baseFee").value(77777));

        String quoteReq = """
                {"address":{"provinceCode":"48","provinceName":"Dak Lak","districtCode":"1","districtName":"Huyen","wardCode":"1","wardName":"Xa"},"subtotal":50000,"weightGrams":1200}
                """;

        mockMvc.perform(post("/api/shipping/quote")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(quoteReq))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("quoted"))
                .andExpect(jsonPath("$.source").value("zone_fallback"))
                .andExpect(jsonPath("$.zoneCode").value("ZX"));

        // 77777 + ceil((1200-1000)/500.0)*3000 = 77777 + 3000
        mockMvc.perform(post("/api/shipping/quote")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(quoteReq))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.fee").value(80_777));
    }

    @Test
    void shipping_quote_uses_code_default_when_no_settings_row() throws Exception {
        // No PUT yet → resolveForQuote uses hardcoded default; province 01 matches Z1
        String quoteReq = """
                {"address":{"provinceCode":"01","provinceName":"HN","districtCode":"1","districtName":"Q","wardCode":"1","wardName":"P"},"subtotal":50000,"weightGrams":500}
                """;
        mockMvc.perform(post("/api/shipping/quote")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(quoteReq))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("quoted"))
                .andExpect(jsonPath("$.zoneCode").value("Z1"))
                .andExpect(jsonPath("$.fee").value(18000));
    }

    @Test
    void local_mo_cay_rule_bypasses_ghn_before_carrier_call() throws Exception {
        User admin = newUser("ship_local_a_" + System.nanoTime(), roleAdmin);
        Login a = login(admin.getUsername(), "Secret12!ab");
        String body = """
                {"zoneRules":[{"zoneCode":"ZZ","label":"Rest","baseFee":1000,"freeShipThreshold":null,"etaDays":{"min":1,"max":2},"provinceCodes":["*"]}],"localRules":[{"enabled":true,"zoneCode":"LOCAL_MO_CAY","label":"Mỏ Cày local delivery","fee":0,"etaDays":{"min":1,"max":1},"provinceCodes":[],"provinceNames":["Vĩnh Long","Bến Tre"],"districtCodes":[],"districtNames":["Mỏ Cày","Mỏ Cày Nam"],"wardCodes":[],"wardNames":["Thị trấn Mỏ Cày","Mỏ Cày"]}],"parcelDefaults":{"length":12,"width":12,"height":12,"weightGrams":600,"declaredValueMode":"none","declaredValueFixed":null}}
                """;
        mockMvc.perform(put("/api/shipping/settings")
                        .header("Authorization", "Bearer " + a.access)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.localRules[0].zoneCode").value("LOCAL_MO_CAY"));

        clearInvocations(ghnShippingService);
        String quoteReq = """
                {"address":{"provinceCode":"86","provinceName":"Vĩnh Long","districtCode":"mc","districtName":"Mỏ Cày","wardCode":"tt","wardName":"Thị trấn Mỏ Cày","street":"123 Not Used"},"subtotal":50000,"weightGrams":1200}
                """;
        mockMvc.perform(post("/api/shipping/quote")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(quoteReq))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("quoted"))
                .andExpect(jsonPath("$.source").value("local_rule"))
                .andExpect(jsonPath("$.zoneCode").value("LOCAL_MO_CAY"))
                .andExpect(jsonPath("$.fee").value(0))
                .andExpect(jsonPath("$.etaDays.min").value(1))
                .andExpect(jsonPath("$.usedFallback").value(false));
        verify(ghnShippingService, never()).quote(any(ShippingAddressDto.class), any(), anyInt(), anyInt(), anyInt(), any());
    }

    @Test
    void migrated_seeded_local_mo_cay_rule_quotes_without_admin_resave() throws Exception {
        ShippingSettingsRecord record = new ShippingSettingsRecord();
        record.setId(ShippingSettingsRecord.SINGLETON_ID);
        record.setZoneRulesJson("[{\"zoneCode\":\"ZZ\",\"label\":\"Rest\",\"baseFee\":1000,\"freeShipThreshold\":null,\"etaDays\":{\"min\":1,\"max\":2},\"provinceCodes\":[\"*\"]}]");
        record.setLocalRulesJson("[{\"enabled\":true,\"zoneCode\":\"LOCAL_MO_CAY\",\"label\":\"Mỏ Cày local delivery\",\"fee\":0,\"etaDays\":{\"min\":1,\"max\":1},\"provinceCodes\":[\"83\",\"86\"],\"provinceNames\":[\"Bến Tre\",\"Vĩnh Long\"],\"districtCodes\":[],\"districtNames\":[\"Mỏ Cày\",\"Mỏ Cày Nam\",\"Huyện Mỏ Cày Nam\"],\"wardCodes\":[],\"wardNames\":[\"Mỏ Cày\",\"Thị trấn Mỏ Cày\"]}]");
        record.setParcelDefaultsJson("{\"length\":12,\"width\":12,\"height\":12,\"weightGrams\":600,\"declaredValueMode\":\"none\",\"declaredValueFixed\":null}");
        record.setUpdatedAt(Instant.now());
        shippingSettingsRepository.saveAndFlush(record);

        clearInvocations(ghnShippingService);
        String quoteReq = """
                {"address":{"provinceCode":"86","provinceName":"Vĩnh Long","districtCode":"mc","districtName":"Mỏ Cày Nam","wardCode":"tt","wardName":"Thị trấn Mỏ Cày"},"subtotal":50000,"weightGrams":1200}
                """;
        mockMvc.perform(post("/api/shipping/quote")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(quoteReq))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("quoted"))
                .andExpect(jsonPath("$.source").value("local_rule"))
                .andExpect(jsonPath("$.zoneCode").value("LOCAL_MO_CAY"))
                .andExpect(jsonPath("$.fee").value(0))
                .andExpect(jsonPath("$.etaDays.min").value(1))
                .andExpect(jsonPath("$.etaDays.max").value(1))
                .andExpect(jsonPath("$.usedFallback").value(false));
        verify(ghnShippingService, never()).quote(any(ShippingAddressDto.class), any(), anyInt(), anyInt(), anyInt(), any());
    }

    @Test
    void disabled_local_rule_falls_back_to_existing_ghn_flow() throws Exception {
        User admin = newUser("ship_disabled_a_" + System.nanoTime(), roleAdmin);
        Login a = login(admin.getUsername(), "Secret12!ab");
        String body = """
                {"zoneRules":[{"zoneCode":"ZZ","label":"Rest","baseFee":1000,"freeShipThreshold":null,"etaDays":{"min":1,"max":2},"provinceCodes":["*"]}],"localRules":[{"enabled":false,"zoneCode":"LOCAL_MO_CAY","label":"Mỏ Cày local delivery","fee":0,"etaDays":{"min":1,"max":1},"provinceCodes":[],"provinceNames":["Vĩnh Long"],"districtCodes":[],"districtNames":["Mỏ Cày"],"wardCodes":[],"wardNames":["Thị trấn Mỏ Cày"]}],"parcelDefaults":{"length":12,"width":12,"height":12,"weightGrams":600,"declaredValueMode":"none","declaredValueFixed":null}}
                """;
        mockMvc.perform(put("/api/shipping/settings")
                        .header("Authorization", "Bearer " + a.access)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body))
                .andExpect(status().isOk());

        clearInvocations(ghnShippingService);
        String quoteReq = """
                {"address":{"provinceCode":"86","provinceName":"Vĩnh Long","districtCode":"mc","districtName":"Mỏ Cày","wardCode":"tt","wardName":"Thị trấn Mỏ Cày"},"subtotal":50000,"weightGrams":1200}
                """;
        mockMvc.perform(post("/api/shipping/quote")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(quoteReq))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.source").value("zone_fallback"))
                .andExpect(jsonPath("$.zoneCode").value("ZZ"));
        verify(ghnShippingService).quote(any(ShippingAddressDto.class), any(), anyInt(), anyInt(), anyInt(), any());
    }

    @Test
    void local_rule_name_fallback_does_not_substring_match_other_districts() throws Exception {
        User admin = newUser("ship_exact_a_" + System.nanoTime(), roleAdmin);
        Login a = login(admin.getUsername(), "Secret12!ab");
        String body = """
                {"zoneRules":[{"zoneCode":"ZZ","label":"Rest","baseFee":1000,"freeShipThreshold":null,"etaDays":{"min":1,"max":2},"provinceCodes":["*"]}],"localRules":[{"enabled":true,"zoneCode":"LOCAL_MO_CAY","label":"Mỏ Cày local delivery","fee":0,"etaDays":{"min":1,"max":1},"provinceCodes":[],"provinceNames":["Vĩnh Long"],"districtCodes":[],"districtNames":["Mỏ Cày"],"wardCodes":[],"wardNames":["Trung Tâm"]}],"parcelDefaults":{"length":12,"width":12,"height":12,"weightGrams":600,"declaredValueMode":"none","declaredValueFixed":null}}
                """;
        mockMvc.perform(put("/api/shipping/settings")
                        .header("Authorization", "Bearer " + a.access)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body))
                .andExpect(status().isOk());

        clearInvocations(ghnShippingService);
        String quoteReq = """
                {"address":{"provinceCode":"86","provinceName":"Vĩnh Long","districtCode":"mc-bac","districtName":"Mỏ Cày Bắc","wardCode":"tt","wardName":"Trung Tâm","rawAddress":"Mỏ Cày local delivery should not be read"},"subtotal":50000,"weightGrams":1200}
                """;
        mockMvc.perform(post("/api/shipping/quote")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(quoteReq))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.source").value("zone_fallback"))
                .andExpect(jsonPath("$.zoneCode").value("ZZ"));
        verify(ghnShippingService).quote(any(ShippingAddressDto.class), any(), anyInt(), anyInt(), anyInt(), any());
    }

    @Test
    void enabled_local_rule_requires_province_district_and_ward_matchers() throws Exception {
        User admin = newUser("ship_matchers_a_" + System.nanoTime(), roleAdmin);
        Login a = login(admin.getUsername(), "Secret12!ab");
        String body = """
                {"zoneRules":[{"zoneCode":"ZZ","label":"Rest","baseFee":1000,"freeShipThreshold":null,"etaDays":{"min":1,"max":2},"provinceCodes":["*"]}],"localRules":[{"enabled":true,"zoneCode":"LOCAL_MO_CAY","label":"Mỏ Cày local delivery","fee":0,"etaDays":{"min":1,"max":1},"provinceCodes":[],"provinceNames":["Vĩnh Long"],"districtCodes":[],"districtNames":["Mỏ Cày"],"wardCodes":[],"wardNames":[]}],"parcelDefaults":{"length":12,"width":12,"height":12,"weightGrams":600,"declaredValueMode":"none","declaredValueFixed":null}}
                """;
        mockMvc.perform(put("/api/shipping/settings")
                        .header("Authorization", "Bearer " + a.access)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.detail").value("Local rule LOCAL_MO_CAY: enabled rule must include ward code or name matcher"));
    }

    private User newUser(String username, Role primaryRole) {
        User u = new User();
        u.setUsername(username);
        u.setPassword(passwordEncoder.encode("Secret12!ab"));
        u.setFullName("T");
        u.setActive(true);
        u.getRoles().add(primaryRole);
        return userRepository.save(u);
    }

    private Login login(String username, String password) throws Exception {
        String raw = mockMvc.perform(post("/api/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"username\":\"" + username + "\",\"password\":\"" + password + "\"}"))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        JsonNode n = objectMapper.readTree(raw);
        assertThat(n.get("accessToken").isMissingNode()).isFalse();
        return new Login(n.get("accessToken").asText());
    }

    private record Login(String access) {
    }
}
