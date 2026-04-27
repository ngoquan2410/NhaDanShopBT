package com.example.nhadanshop.service;

import com.example.nhadanshop.entity.Category;
import com.example.nhadanshop.entity.Product;
import com.example.nhadanshop.entity.ProductBatch;
import com.example.nhadanshop.entity.ProductVariant;
import com.example.nhadanshop.repository.ProductBatchRepository;
import com.example.nhadanshop.repository.ProductRepository;
import com.example.nhadanshop.repository.SalesInvoiceItemBatchAllocationRepository;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentMatchers;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.Mockito.atLeastOnce;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * Slice 3: sales FEFO must call sellable repository methods only (no legacy FEFO in deduct path).
 * Blocked/expired/inactive cases are filtered in JPQL; here we only assert call wiring + empty/failure.
 */
@ExtendWith(MockitoExtension.class)
class ProductBatchServiceSlice3FefoTest {

    @Mock
    private ProductBatchRepository batchRepo;
    @Mock
    private ProductRepository productRepo;
    @Mock
    private SalesInvoiceItemBatchAllocationRepository allocationRepo;
    @Mock
    private StockMutationService stockMutationService;

    @InjectMocks
    private ProductBatchService productBatchService;

    @Test
    void deductStockFEFOWithTraceByVariant_callsFindSellableByVariantIdForUpdateFefo() {
        long variantId = 9L;
        when(batchRepo.findSellableByVariantIdForUpdateFefo(variantId)).thenReturn(
                List.of(sellableBatch(9L, 5, BigDecimal.TEN, variantId))
        );
        var result = productBatchService.deductStockFEFOWithTraceByVariant(1L, variantId, 2);
        assertEquals(1, result.batchDeductions().size());
        assertEquals(2, result.batchDeductions().get(0).deductedQty());
        verify(batchRepo).findSellableByVariantIdForUpdateFefo(variantId);
        verify(batchRepo, never()).findByVariantIdForUpdateFEFO(ArgumentMatchers.anyLong());
        verify(stockMutationService).syncVariantStockWithBatches(variantId);
    }

    @Test
    void deductStockFEFOWithTraceByVariant_throwsWhenNoSellableBatches() {
        long variantId = 10L;
        when(batchRepo.findSellableByVariantIdForUpdateFefo(variantId)).thenReturn(List.of());
        IllegalStateException ex = assertThrows(
                IllegalStateException.class,
                () -> productBatchService.deductStockFEFOWithTraceByVariant(1L, variantId, 1));
        assertTrue(ex.getMessage().contains("đủ điều kiện bán"));
        verify(batchRepo, never()).findByVariantIdForUpdateFEFO(ArgumentMatchers.anyLong());
    }

    @Test
    void deductStockFEFOWithTrace_productOnly_callsFindSellableByProductIdForUpdateFefo() {
        long productId = 3L;
        ProductVariant v = new ProductVariant();
        v.setId(11L);
        v.setProduct(sampleProduct(3L, true));
        v.setActive(true);
        ProductBatch b = sellableBatch(1L, 3, BigDecimal.ONE, 11L);
        b.setVariant(v);
        when(batchRepo.findSellableByProductIdForUpdateFefo(productId)).thenReturn(List.of(b));
        productBatchService.deductStockFEFOWithTrace(productId, null, 1);
        verify(batchRepo).findSellableByProductIdForUpdateFefo(productId);
        verify(batchRepo, never()).findByProductIdForUpdateFEFO(ArgumentMatchers.anyLong());
        verify(stockMutationService, atLeastOnce()).syncVariantStockWithBatches(11L);
    }

    private static Product sampleProduct(long id, boolean active) {
        Product p = new Product();
        p.setId(id);
        p.setActive(active);
        Category c = new Category();
        c.setName("c");
        p.setCategory(c);
        p.setName("n");
        p.setCode("c" + id);
        return p;
    }

    private static ProductBatch sellableBatch(long id, int remaining, BigDecimal cost, long variantId) {
        Product p = sampleProduct(1L, true);
        ProductVariant v = new ProductVariant();
        v.setId(variantId);
        v.setProduct(p);
        v.setActive(true);
        v.setVariantCode("V" + variantId);
        v.setVariantName("vn");
        v.setSellUnit("goi");
        ProductBatch b = new ProductBatch();
        b.setId(id);
        b.setBatchCode("BATCH-" + id);
        b.setProduct(p);
        b.setVariant(v);
        b.setImportQty(remaining);
        b.setRemainingQty(remaining);
        b.setCostPrice(cost);
        b.setStatus(ProductBatch.STATUS_ACTIVE);
        b.setExpiryDate(LocalDate.now().plusDays(30));
        b.setMfgDate(LocalDate.now().minusDays(1));
        return b;
    }
}
