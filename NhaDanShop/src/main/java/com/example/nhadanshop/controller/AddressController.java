package com.example.nhadanshop.controller;

import com.example.nhadanshop.dto.AddressAutocompleteResponse;
import com.example.nhadanshop.dto.AddressDistrictDto;
import com.example.nhadanshop.dto.AddressPlaceDetailResponse;
import com.example.nhadanshop.dto.AddressProvinceDto;
import com.example.nhadanshop.dto.AddressWardDto;
import com.example.nhadanshop.service.AddressLookupService;
import com.example.nhadanshop.service.GoongAddressService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

import java.util.List;

@RestController
@RequiredArgsConstructor
public class AddressController {

    private final AddressLookupService addressLookupService;
    private final GoongAddressService goongAddressService;

    @GetMapping("/api/addresses/provinces")
    public List<AddressProvinceDto> listProvinces() {
        return addressLookupService.listProvinces();
    }

    @GetMapping("/api/addresses/districts")
    public List<AddressDistrictDto> listDistricts(@RequestParam String provinceCode) {
        return addressLookupService.listDistricts(provinceCode);
    }

    @GetMapping("/api/addresses/wards")
    public List<AddressWardDto> listWards(@RequestParam String districtCode) {
        return addressLookupService.listWards(districtCode);
    }

    @GetMapping("/api/address-autocomplete")
    public ResponseEntity<AddressAutocompleteResponse> autocomplete(
            @RequestParam String input,
            @RequestParam(defaultValue = "false") boolean dryRun) {
        try {
            return ResponseEntity.ok(goongAddressService.autocomplete(input, dryRun));
        } catch (ResponseStatusException e) {
            if (e.getStatusCode().value() == HttpStatus.TOO_MANY_REQUESTS.value()) {
                return ResponseEntity.ok(new AddressAutocompleteResponse(Boolean.TRUE, List.of(), null, null));
            }
            throw e;
        }
    }

    @GetMapping("/api/address-place-detail")
    public ResponseEntity<AddressPlaceDetailResponse> placeDetail(
            @RequestParam String placeId,
            @RequestParam(defaultValue = "false") boolean dryRun) {
        try {
            return ResponseEntity.ok(goongAddressService.placeDetail(placeId, dryRun));
        } catch (ResponseStatusException e) {
            if (e.getStatusCode().value() == HttpStatus.TOO_MANY_REQUESTS.value()) {
                return ResponseEntity.ok(new AddressPlaceDetailResponse(Boolean.TRUE, null, null, null));
            }
            throw e;
        }
    }
}
