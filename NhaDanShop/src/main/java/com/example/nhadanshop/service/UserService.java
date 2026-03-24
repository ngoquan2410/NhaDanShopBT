package com.example.nhadanshop.service;

import com.example.nhadanshop.dto.UserRequest;
import com.example.nhadanshop.dto.UserResponse;
import com.example.nhadanshop.dto.UserUpdateRequest;
import com.example.nhadanshop.entity.Role;
import com.example.nhadanshop.entity.User;
import com.example.nhadanshop.repository.RoleRepository;
import com.example.nhadanshop.repository.UserRepository;
import jakarta.persistence.EntityNotFoundException;
import jakarta.transaction.Transactional;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;
import java.util.HashSet;
import java.util.Set;

@Service
@RequiredArgsConstructor
public class UserService {

    private final UserRepository userRepo;
    private final RoleRepository roleRepo;
    private final PasswordEncoder passwordEncoder;

    public Page<UserResponse> listUsers(Pageable pageable) {
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
        if (req.password() != null && !req.password().isBlank()) {
            user.setPassword(passwordEncoder.encode(req.password()));
        }
        if (req.isActive() != null) user.setActive(req.isActive());
        if (req.roles() != null && !req.roles().isEmpty()) {
            user.setRoles(resolveRoles(req.roles()));
        }
        user.setUpdatedAt(LocalDateTime.now());

        return DtoMapper.toResponse(userRepo.save(user));
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
