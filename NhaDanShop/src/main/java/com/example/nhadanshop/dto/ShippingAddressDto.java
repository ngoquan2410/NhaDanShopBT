package com.example.nhadanshop.dto;

import jakarta.validation.constraints.Size;

public record ShippingAddressDto(
        @Size(max = 150) String receiverName,
        @Size(max = 30) String phone,
        @Size(max = 50) String provinceCode,
        @Size(max = 150) String provinceName,
        @Size(max = 50) String districtCode,
        @Size(max = 150) String districtName,
        @Size(max = 50) String wardCode,
        @Size(max = 150) String wardName,
        @Size(max = 255) String street,
        @Size(max = 255) String note
) {}
