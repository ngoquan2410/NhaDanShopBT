package com.example.nhadanshop.controller;

import com.example.nhadanshop.dto.VietQrGenerateRequest;
import com.example.nhadanshop.dto.VietQrResultDto;
import com.example.nhadanshop.service.VietQrService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

@RestController
@RequestMapping("/api/vietqr")
@RequiredArgsConstructor
public class VietQrController {

    private final VietQrService vietQrService;

    @PostMapping("/generate")
    public VietQrResultDto generate(
            @Valid @RequestBody VietQrGenerateRequest request,
            Authentication authentication) {
        // Public generation remains for checkout/pending-payment using backend-owned
        // stored settings. Preview-style overrides are admin-only.
        if (request.settingsOverride() != null && !hasAdminRole(authentication)) {
            throw new ResponseStatusException(
                    HttpStatus.FORBIDDEN,
                    "VietQR preview override requires admin authentication");
        }
        return vietQrService.generate(request);
    }

    private boolean hasAdminRole(Authentication authentication) {
        return authentication != null
                && authentication.isAuthenticated()
                && authentication.getAuthorities().stream()
                .anyMatch(authority -> "ROLE_ADMIN".equals(authority.getAuthority()));
    }
}
