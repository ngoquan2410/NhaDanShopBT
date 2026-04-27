package com.example.nhadanshop.dto;

import java.util.List;

public record InventoryProjectionResponse(
        Long variantId,
        Long productId,
        String productCode,
        String productName,
        String variantCode,
        String variantName,
        String sellUnit,
        int onHand,
        int reserved,
        int available,
        /**
         * Sale-sellable stock from unified sellable predicate; {@code null} for COMBO products (virtual
         * stock, no physical batch rows on the combo variant). SINGLE only.
         */
        Integer sellableQty,
        List<InventoryProjectionBatchResponse> byBatch
) {}
