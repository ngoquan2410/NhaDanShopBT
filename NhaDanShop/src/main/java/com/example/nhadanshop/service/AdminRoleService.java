package com.example.nhadanshop.service;

import com.example.nhadanshop.dto.AdminRoleOptionResponse;
import com.example.nhadanshop.entity.Role;
import com.example.nhadanshop.repository.RoleRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.util.List;
import java.util.Locale;

@Service
@RequiredArgsConstructor
public class AdminRoleService {

    private static final List<String> ASSIGNABLE_ADMIN_ROLE_CODES = List.of("ROLE_ADMIN", "ROLE_STAFF");

    private final RoleRepository roleRepository;

    public List<AdminRoleOptionResponse> listAssignableRoles() {
        return roleRepository.findAllByNameInOrderByNameAsc(ASSIGNABLE_ADMIN_ROLE_CODES).stream()
                .map(this::toResponse)
                .toList();
    }

    private AdminRoleOptionResponse toResponse(Role role) {
        return new AdminRoleOptionResponse(
                role.getId(),
                role.getName(),
                toLabel(role),
                role.getDescription()
        );
    }

    private String toLabel(Role role) {
        String code = role.getName() == null ? "" : role.getName().toUpperCase(Locale.ROOT);
        return switch (code) {
            case "ROLE_ADMIN" -> "Quản trị viên";
            case "ROLE_STAFF" -> "Nhân viên";
            default -> role.getDescription() != null && !role.getDescription().isBlank()
                    ? role.getDescription()
                    : role.getName();
        };
    }
}
