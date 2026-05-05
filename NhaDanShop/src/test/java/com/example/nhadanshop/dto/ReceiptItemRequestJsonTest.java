package com.example.nhadanshop.dto;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;

import static org.assertj.core.api.Assertions.assertThat;

class ReceiptItemRequestJsonTest {

    @Test
    void receiptItemRequestAcceptsCatalogPricingHints() throws Exception {
        ObjectMapper mapper = new ObjectMapper();

        ReceiptItemRequest req = mapper.readValue("""
                {
                  "productId": 12,
                  "quantity": 2,
                  "unitCost": 7000,
                  "discountPercent": 0,
                  "sellPrice": 12000,
                  "isSellable": true,
                  "isSellableExplicit": true,
                  "importUnit": "Bich",
                  "piecesOverride": 1,
                  "variantId": 34,
                  "expiryDateOverride": null
                }
                """, ReceiptItemRequest.class);

        assertThat(req.sellPrice()).isEqualByComparingTo(new BigDecimal("12000"));
        assertThat(req.isSellable()).isTrue();
        assertThat(req.isSellableExplicit()).isTrue();
        assertThat(req.importUnit()).isEqualTo("Bich");
    }
}
