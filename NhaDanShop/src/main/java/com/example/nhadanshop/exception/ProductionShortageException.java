package com.example.nhadanshop.exception;

import com.example.nhadanshop.dto.production.ProductionRecipeDtos.ProductionShortageDetailDto;

import java.util.List;

public class ProductionShortageException extends RuntimeException {
    private final List<ProductionShortageDetailDto> shortages;

    public ProductionShortageException(String message, List<ProductionShortageDetailDto> shortages) {
        super(message);
        this.shortages = shortages;
    }

    public List<ProductionShortageDetailDto> getShortages() {
        return shortages;
    }
}
