package com.example.nhadanshop.service;

import com.example.nhadanshop.dto.InventoryProjectionResponse;
import com.example.nhadanshop.entity.Category;
import com.example.nhadanshop.entity.Product;
import com.example.nhadanshop.entity.ProductVariant;
import com.example.nhadanshop.repository.ProductBatchRepository;
import com.example.nhadanshop.repository.ProductVariantRepository;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class InventoryProjectionServiceSlice4aTest {

    @Mock
    private ProductVariantRepository variantRepository;
    @Mock
    private ProductBatchRepository batchRepository;

    @InjectMocks
    private InventoryProjectionService inventoryProjectionService;

    @Test
    void getProjection_single_sellableFromAggregate() {
        Product p = new Product();
        p.setId(1L);
        p.setCode("P");
        p.setName("N");
        p.setProductType(Product.ProductType.SINGLE);
        p.setActive(true);
        p.setCategory(new Category());

        ProductVariant v = new ProductVariant();
        v.setId(10L);
        v.setProduct(p);
        v.setVariantCode("V");
        v.setVariantName("VN");
        v.setSellUnit("goi");
        v.setActive(true);

        when(variantRepository.findById(10L)).thenReturn(java.util.Optional.of(v));
        when(batchRepository.findActiveBatchesByVariantId(10L)).thenReturn(List.of());
        when(batchRepository.sumSellableRemainingQtyByVariantIds(List.of(10L)))
                .thenReturn(List.<Object[]>of(new Object[]{10L, 5}));

        InventoryProjectionResponse r = inventoryProjectionService.getProjection(10L);
        assertEquals(0, r.onHand());
        assertEquals(0, r.available());
        assertEquals(5, r.sellableQty());
    }

    @Test
    void getProjection_combo_sellableNull() {
        Product p = new Product();
        p.setId(2L);
        p.setCode("C");
        p.setName("Combo");
        p.setProductType(Product.ProductType.COMBO);
        p.setActive(true);
        p.setCategory(new Category());

        ProductVariant v = new ProductVariant();
        v.setId(20L);
        v.setProduct(p);
        v.setVariantCode("CV");
        v.setVariantName("CVN");
        v.setSellUnit("combo");
        v.setActive(true);

        when(variantRepository.findById(20L)).thenReturn(java.util.Optional.of(v));
        when(batchRepository.findActiveBatchesByVariantId(20L)).thenReturn(List.of());

        InventoryProjectionResponse r = inventoryProjectionService.getProjection(20L);
        assertNotNull(r);
        assertNull(r.sellableQty());
    }
}
