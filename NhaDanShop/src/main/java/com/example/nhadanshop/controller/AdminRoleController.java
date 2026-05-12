package com.example.nhadanshop.controller;

import com.example.nhadanshop.dto.AdminRoleOptionResponse;
import com.example.nhadanshop.service.AdminRoleService;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@RestController
@RequestMapping("/api/admin/roles")
@RequiredArgsConstructor
public class AdminRoleController {

    private final AdminRoleService adminRoleService;

    @GetMapping
    public List<AdminRoleOptionResponse> listRoles() {
        return adminRoleService.listAssignableRoles();
    }
}
