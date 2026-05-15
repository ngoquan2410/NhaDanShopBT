package com.example.nhadanshop.service;

import com.example.nhadanshop.dto.AdminResetPasswordRequest;
import com.example.nhadanshop.dto.UserRequest;
import com.example.nhadanshop.dto.UserResponse;
import com.example.nhadanshop.dto.UserUpdateRequest;
import com.example.nhadanshop.entity.Role;
import com.example.nhadanshop.entity.User;
import com.example.nhadanshop.repository.RefreshTokenRepository;
import com.example.nhadanshop.repository.RoleRepository;
import com.example.nhadanshop.repository.UserRepository;
import jakarta.persistence.EntityNotFoundException;
import jakarta.transaction.Transactional;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;

import com.example.nhadanshop.security.PasswordPolicy;

import java.time.LocalDateTime;
import java.util.HashSet;
import java.util.Set;

@Service
@RequiredArgsConstructor
public class UserService {

    private final UserRepository userRepo;
    private final RoleRepository roleRepo;
    private final RefreshTokenRepository refreshTokenRepo;
    private final PasswordEncoder passwordEncoder;

    public Page<UserResponse> listUsers(Pageable pageable) {
        return listUsers(pageable, null);
    }

    public Page<UserResponse> listUsers(Pageable pageable, String search) {
        String q = (search != null && !search.isBlank()) ? search.trim() : null;
        if (q != null) {
            return userRepo.findForAdminList(q, pageable).map(DtoMapper::toResponse);
        }
        return userRepo.findAllByOrderByCreatedAtDesc(pageable)
                .map(DtoMapper::toResponse);
    }

    public UserResponse getUser(Long id) {
        return DtoMapper.toResponse(findById(id));
    }

    @Transactional
    public UserResponse createUser(UserRequest req) {
        if (userRepo.existsByUsername(req.username())) {
            throw new IllegalStateException("Username '" + req.username() + "' đã tồn tại");
        }

        PasswordPolicy.validate(req.password(), req.username());

        User user = new User();
        user.setUsername(req.username());
        user.setPassword(passwordEncoder.encode(req.password()));
        user.setFullName(req.fullName());
        user.setActive(true);
        user.setCreatedAt(LocalDateTime.now());
        user.setUpdatedAt(LocalDateTime.now());
        user.setRoles(resolveRoles(req.roles()));

        return DtoMapper.toResponse(userRepo.save(user));
    }

    @Transactional
    public UserResponse updateUser(Long id, UserUpdateRequest req) {
        User user = findById(id);

        if (req.fullName() != null) user.setFullName(req.fullName());
        boolean passwordChanged = false;
        if (req.password() != null && !req.password().isBlank()) {
            PasswordPolicy.validate(req.password(), user.getUsername());
            if (!passwordEncoder.matches(req.password(), user.getPassword())) {
                user.setPassword(passwordEncoder.encode(req.password()));
                passwordChanged = true;
            }
        }
        if (req.isActive() != null) user.setActive(req.isActive());
        if (req.roles() != null && !req.roles().isEmpty()) {
            user.setRoles(resolveRoles(req.roles()));
        }
        user.setUpdatedAt(LocalDateTime.now());
        User saved = userRepo.save(user);
        if (passwordChanged) {
            refreshTokenRepo.revokeAllByUser(saved);
        }
        return DtoMapper.toResponse(saved);
    }

    @Transactional
    public void resetPasswordByAdmin(Long targetId, AdminResetPasswordRequest req, String actingUsername) {
        User target = findById(targetId);
        if (target.getUsername().equalsIgnoreCase(actingUsername)) {
            throw new IllegalArgumentException(
                    "Không thể đặt lại mật khẩu cho chính bạn. Vui lòng dùng mục đổi mật khẩu trong Bảo mật.");
        }
        if (!req.newPassword().equals(req.confirmPassword())) {
            throw new IllegalArgumentException("Xác nhận mật khẩu không khớp");
        }
        PasswordPolicy.validate(req.newPassword(), target.getUsername());
        if (passwordEncoder.matches(req.newPassword(), target.getPassword())) {
            throw new IllegalArgumentException("Mật khẩu mới phải khác mật khẩu cũ");
        }
        target.setPassword(passwordEncoder.encode(req.newPassword()));
        target.setUpdatedAt(LocalDateTime.now());
        userRepo.save(target);
        refreshTokenRepo.revokeAllByUser(target);
    }

    @Transactional
    public void deactivateUser(Long id) {
        User user = findById(id);
        user.setActive(false);
        user.setUpdatedAt(LocalDateTime.now());
        userRepo.save(user);
    }

    private User findById(Long id) {
        return userRepo.findById(id)
                .orElseThrow(() -> new EntityNotFoundException("Không tìm thấy user ID: " + id));
    }

    private Set<Role> resolveRoles(Set<String> roleNames) {
        Set<Role> roles = new HashSet<>();
        for (String name : roleNames) {
            Role role = roleRepo.findByName(name)
                    .orElseThrow(() -> new IllegalArgumentException("Không tìm thấy role: " + name));
            roles.add(role);
        }
        return roles;
    }
}
