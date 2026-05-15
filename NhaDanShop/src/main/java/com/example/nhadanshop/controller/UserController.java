package com.example.nhadanshop.controller;

import com.example.nhadanshop.dto.AdminResetPasswordRequest;
import com.example.nhadanshop.dto.UserRequest;
import com.example.nhadanshop.dto.UserResponse;
import com.example.nhadanshop.dto.UserUpdateRequest;
import com.example.nhadanshop.service.UserService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.web.PageableDefault;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/admin/users")
@RequiredArgsConstructor
public class UserController {

    private final UserService userService;

    /** GET /api/admin/users?page=0&size=10&search= */
    @GetMapping
    public Page<UserResponse> list(
            @RequestParam(required = false) String search,
            @PageableDefault(size = 20) Pageable pageable) {
        return userService.listUsers(pageable, search);
    }

    /** GET /api/admin/users/{id} */
    @GetMapping("/{id}")
    public UserResponse one(@PathVariable Long id) {
        return userService.getUser(id);
    }

    /** POST /api/admin/users – Tạo user mới */
    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public UserResponse create(@Valid @RequestBody UserRequest req) {
        return userService.createUser(req);
    }

    /** PUT /api/admin/users/{id} – Cập nhật user (fullName, password, roles, isActive) */
    @PutMapping("/{id}")
    public UserResponse update(@PathVariable Long id, @Valid @RequestBody UserUpdateRequest req) {
        return userService.updateUser(id, req);
    }

    /** DELETE /api/admin/users/{id} – Vô hiệu hoá user (soft delete) */
    @DeleteMapping("/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void deactivate(@PathVariable Long id) {
        userService.deactivateUser(id);
    }

    /** POST /api/admin/users/{id}/reset-password – Admin đặt lại mật khẩu user khác */
    @PostMapping("/{id}/reset-password")
    public ResponseEntity<Void> resetPassword(
            @PathVariable Long id,
            Authentication auth,
            @Valid @RequestBody AdminResetPasswordRequest req) {
        userService.resetPasswordByAdmin(id, req, auth.getName());
        return ResponseEntity.noContent().build();
    }
}
