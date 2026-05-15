package com.example.nhadanshop.service;

import com.example.nhadanshop.dto.SignUpRequest;
import com.example.nhadanshop.entity.Customer;
import com.example.nhadanshop.entity.Role;
import com.example.nhadanshop.entity.User;
import com.example.nhadanshop.exception.BusinessConflictException;
import com.example.nhadanshop.repository.CustomerRepository;
import com.example.nhadanshop.repository.PasswordResetTokenRepository;
import com.example.nhadanshop.repository.RefreshTokenRepository;
import com.example.nhadanshop.repository.RoleRepository;
import com.example.nhadanshop.repository.SalesInvoiceRepository;
import com.example.nhadanshop.repository.UserRepository;
import com.example.nhadanshop.security.CustomUserDetailsService;
import com.example.nhadanshop.security.JwtTokenProvider;
import com.example.nhadanshop.security.TotpService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.security.crypto.password.PasswordEncoder;

import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class AuthServiceSignUpConflictTest {

    @Mock private UserRepository userRepo;
    @Mock private RoleRepository roleRepo;
    @Mock private RefreshTokenRepository refreshTokenRepo;
    @Mock private CustomUserDetailsService userDetailsService;
    @Mock private JwtTokenProvider jwtTokenProvider;
    @Mock private TotpService totpService;
    @Mock private PasswordEncoder passwordEncoder;
    @Mock private CustomerRepository customerRepository;
    @Mock private SalesInvoiceRepository salesInvoiceRepository;
    @Mock private PasswordResetTokenRepository passwordResetTokenRepo;
    @Mock private JavaMailSender mailSender;

    private AuthService authService;

    @BeforeEach
    void setUp() {
        authService = new AuthService(
                userRepo, roleRepo, refreshTokenRepo, userDetailsService, jwtTokenProvider, totpService,
                passwordEncoder, customerRepository, salesInvoiceRepository, passwordResetTokenRepo, mailSender
        );
    }

    @Test
    void signup_rejects_phone_already_linked_to_user_with_controlled_code() {
        SignUpRequest req = new SignUpRequest("u1", "StrongPass#2026", "User 1", "0909123456");
        Role userRole = new Role();
        userRole.setName("ROLE_USER");
        Customer customer = new Customer();
        customer.setId(101L);

        when(userRepo.existsByUsername("u1")).thenReturn(false);
        when(roleRepo.findByName("ROLE_USER")).thenReturn(Optional.of(userRole));
        when(customerRepository.findAllByPhoneAndActiveTrue("0909123456")).thenReturn(List.of(customer));
        when(userRepo.findByCustomerId(101L)).thenReturn(Optional.of(new User()));

        assertThatThrownBy(() -> authService.signUp(req))
                .isInstanceOf(BusinessConflictException.class)
                .satisfies(ex -> assertThat(((BusinessConflictException) ex).getCode())
                        .isEqualTo("PHONE_ALREADY_REGISTERED"));
    }

    @Test
    void signup_maps_uk_users_customer_id_violation_to_phone_registered_code() {
        SignUpRequest req = new SignUpRequest("u2", "StrongPass#2026", "User 2", "0909123000");
        Role userRole = new Role();
        userRole.setName("ROLE_USER");
        Customer customer = new Customer();
        customer.setId(102L);

        when(userRepo.existsByUsername("u2")).thenReturn(false);
        when(roleRepo.findByName("ROLE_USER")).thenReturn(Optional.of(userRole));
        when(customerRepository.findAllByPhoneAndActiveTrue("0909123000")).thenReturn(List.of(customer));
        when(userRepo.findByCustomerId(102L)).thenReturn(Optional.empty());
        when(passwordEncoder.encode(any())).thenReturn("hashed");
        when(userRepo.save(any(User.class))).thenThrow(new DataIntegrityViolationException("constraint uk_users_customer_id"));

        assertThatThrownBy(() -> authService.signUp(req))
                .isInstanceOf(BusinessConflictException.class)
                .satisfies(ex -> assertThat(((BusinessConflictException) ex).getCode())
                        .isEqualTo("PHONE_ALREADY_REGISTERED"));
    }
}
