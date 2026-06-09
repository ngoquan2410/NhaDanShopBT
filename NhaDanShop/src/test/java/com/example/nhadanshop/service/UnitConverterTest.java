package com.example.nhadanshop.service;

import org.junit.jupiter.api.Test;

import java.math.BigDecimal;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

class UnitConverterTest {

    @Test
    void decimalImportQuantity_convertsExactlyToRetailStock() {
        assertEquals(500, UnitConverter.toRetailQty(1000, new BigDecimal("0.5")));
        assertEquals(2500, UnitConverter.toRetailQty(1000, new BigDecimal("2.5")));
    }

    @Test
    void decimalImportQuantity_rejectsFractionalRetailStock() {
        assertThrows(
                IllegalArgumentException.class,
                () -> UnitConverter.toRetailQty(3, new BigDecimal("0.5"))
        );
    }
}
