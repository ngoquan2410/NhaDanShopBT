package com.example.nhadanshop.dto.production;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;
import jakarta.validation.constraints.Size;

import java.math.BigDecimal;
import java.util.List;

public class ProductionRecipeDtos {

    public record ComponentLine(
            @NotNull Long productId,
            @NotNull Long variantId,
            @Positive int qtyPerOutput,
            @NotBlank @Size(max = 32) String unit,
            Integer sortOrder
    ) {}

    public record CreateProductionRecipeRequest(
            @NotBlank @Size(max = 80) String recipeCode,
            @NotBlank @Size(max = 200) String name,
            @NotNull Long outputProductId,
            @NotNull Long outputVariantId,
            @Positive int outputQty,
            Boolean outputMustBeSellable,
            BigDecimal overheadCost,
            @NotNull @Size(min = 1) List<ComponentLine> components
    ) {}

    public record PatchProductionRecipeRequest(
            String name,
            Boolean outputMustBeSellable,
            BigDecimal overheadCost,
            Boolean active,
            List<ComponentLine> components
    ) {}

    public record ProductionRecipeComponentResponse(
            Long id,
            Long productId,
            Long variantId,
            Integer qtyPerOutput,
            String unit,
            Integer sortOrder,
            /** Đơn vị tồn/bán lẻ trên variant — BOM auto-fill */
            String sellUnit,
            String importUnit,
            Integer piecesPerImportUnit,
            /** Tổng tồn lô input cho SX (active, chưa hết hạn). */
            Integer availableQty,
            /** HSD gần nhất của lô input (ISO date+time). */
            String nearestExpiryDateIso
    ) {}

    public record ProductionRecipeResponse(
            Long id,
            String recipeCode,
            String name,
            Long outputProductId,
            Long outputVariantId,
            Integer outputQty,
            Boolean outputMustBeSellable,
            BigDecimal overheadCost,
            Boolean active,
            Boolean archived,
            List<ProductionRecipeComponentResponse> components,
            String updatedAtIso
    ) {}

    /** Preview/create order payloads */
    public record ProductionPreviewRequest(
            @NotNull Long recipeId,
            @Positive int outputQty,
            BigDecimal overheadCost
    ) {}

    public record PreviewAllocationDto(
            Long batchId,
            String lotCode,
            int qty,
            BigDecimal unitCost,
            String expiryDateIso
    ) {}

    public record PreviewComponentDto(
            Long productId,
            Long variantId,
            String productName,
            String variantName,
            String variantCode,
            int requiredQty,
            int availableQty,
            int missingQty,
            String unit,
            List<PreviewAllocationDto> allocations
    ) {}

    public record ProductionShortageDetailDto(
            Long productId,
            Long variantId,
            String productName,
            String variantName,
            String variantCode,
            int requiredQty,
            int availableQty,
            int missingQty,
            String unit
    ) {}

    public record ProductionPreviewResponse(
            Long recipeId,
            int outputQty,
            Boolean outputMustBeSellable,
            BigDecimal overheadCost,
            BigDecimal estimatedConsumedCost,
            BigDecimal estimatedOutputUnitCost,
            String expectedOutputExpiryDateIso,
            int maxProducibleQty,
            List<PreviewComponentDto> components
    ) {}

    public record CreateProductionOrderRequest(
            @NotNull Long recipeId,
            @Positive int outputQty,
            BigDecimal overheadCost,
            String note
    ) {}

    public record ProductionOrderVoidRequest(String reason, String voidedBy) {}

    public record ProductionMovementDto(
            String sourceType,
            Long variantId,
            Long batchId,
            Integer qtyDelta,
            String sourceId,
            String createdAtIso
    ) {}

    public record ProductionOrderComponentResponse(
            Long id,
            Long productId,
            Long variantId,
            String productName,
            String variantName,
            String variantCode,
            int requiredQty,
            int consumedQty,
            String unit,
            List<AllocationResponse> allocations
    ) {}

    public record AllocationResponse(
            Long id,
            Long batchId,
            String lotCode,
            int qty,
            BigDecimal unitCost,
            BigDecimal totalCost,
            Integer allocationIndex,
            String expiryDateIso
    ) {}

    public record ProductionOrderResponse(
            Long id,
            String orderNo,
            String status,
            Long recipeId,
            String recipeSnapshotJson,
            Long outputProductId,
            Long outputVariantId,
            int outputQty,
            Boolean outputMustBeSellable,
            BigDecimal overheadCost,
            Long outputBatchId,
            String outputBatchCode,
            BigDecimal outputUnitCost,
            String outputExpiryDateIso,
            List<ProductionOrderComponentResponse> components,
            List<ProductionMovementDto> movements,
            String createdAtIso,
            String note,
            String voidedAtIso,
            String voidReason
    ) {}
}
