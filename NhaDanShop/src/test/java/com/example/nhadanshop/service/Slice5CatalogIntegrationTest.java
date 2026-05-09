package com.example.nhadanshop.service;

import com.example.nhadanshop.entity.Category;
import com.example.nhadanshop.entity.Product;
import com.example.nhadanshop.entity.ProductBatch;
import com.example.nhadanshop.entity.ProductVariant;
import com.example.nhadanshop.repository.CategoryRepository;
import com.example.nhadanshop.repository.ProductBatchRepository;
import com.example.nhadanshop.repository.ProductRepository;
import com.example.nhadanshop.repository.ProductVariantRepository;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;
import org.springframework.context.annotation.Import;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.test.context.TestPropertySource;

import java.math.BigDecimal;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.Mockito.when;

/**
 * Slice 5: isSellable sales guards, safe product delete, category archive when in use.
 */
@DataJpaTest
@TestPropertySource(properties = {
        "spring.flyway.enabled=false",
        "spring.jpa.hibernate.ddl-auto=create-drop"
})
@Import({ProductVariantService.class, ProductService.class, CategoryService.class})
class Slice5CatalogIntegrationTest {

    @MockBean
    private StockedCatalogGuardService stockedCatalogGuardService;

    @MockBean
    private Clock businessClock;

    @Autowired
    private ProductVariantService productVariantService;
    @Autowired
    private ProductService productService;
    @Autowired
    private CategoryService categoryService;
    @Autowired
    private CategoryRepository categoryRepository;
    @Autowired
    private ProductRepository productRepository;
    @Autowired
    private ProductVariantRepository variantRepository;
    @Autowired
    private ProductBatchRepository batchRepository;
    @Test
    void sellableFalse_blocksSalesResolve_true() {
        ProductVariant v = newVariant("SL5-A", true, false);
        assertThrows(
                IllegalStateException.class,
                () -> productVariantService.resolveVariant(v.getId(), v.getProduct().getId(), true));
        assertNotNull(
                productVariantService.resolveVariant(v.getId(), v.getProduct().getId(), false));
    }

    @Test
    void productHardDeleteWhenUnused() {
        Product p = newProduct("SL5-NEW");
        long id = p.getId();
        productService.deleteOrArchive(id);
        assertTrue(productRepository.findById(id).isEmpty());
    }

    @Test
    void productArchivesWhenStructurallyUsed() {
        Product p = newProduct("SL5-USED");
        ProductVariant v = newVariant("SL5-B", p, true, true);
        ProductBatch b = new ProductBatch();
        b.setProduct(p);
        b.setVariant(v);
        b.setBatchCode("B-SL5-1");
        b.setExpiryDate(LocalDate.now().plusDays(10));
        b.setImportQty(1);
        b.setRemainingQty(1);
        b.setCostPrice(BigDecimal.ONE);
        batchRepository.save(b);
        long id = p.getId();
        productService.deleteOrArchive(id);
        assertTrue(productRepository.findById(id).orElseThrow().getActive() == false);
    }

    @Test
    void categoryArchivesWhenProductExists() {
        Category c = new Category();
        c.setName("CAT-SL5-1");
        c.setDescription("d");
        c.setActive(true);
        c = categoryRepository.save(c);
        Product p = new Product();
        p.setCode("CP-SL5");
        p.setName("C Product");
        p.setCategory(c);
        p.setActive(true);
        p.setProductType(Product.ProductType.SINGLE);
        productRepository.save(p);
        categoryService.deleteOrArchive(c.getId());
        assertTrue(categoryRepository.findById(c.getId()).orElseThrow().getActive() == false);
    }

    @Test
    void categoryHardDeleteWhenEmptyAndNoPromotion() {
        Category c = new Category();
        c.setName("CAT-SL5-EMPTY");
        c.setDescription("d");
        c.setActive(true);
        c = categoryRepository.save(c);
        long id = c.getId();
        categoryService.deleteOrArchive(id);
        assertFalse(categoryRepository.findById(id).isPresent());
    }

    @Test
    void productDetail_uses_sellable_stock_zero_when_batches_expired() {
        when(businessClock.instant()).thenReturn(Instant.parse("2026-05-09T00:00:00Z"));
        when(businessClock.getZone()).thenReturn(ZoneId.of("UTC"));
        Product p = newProduct("SL5-DET-EXPIRED");
        ProductVariant v = newVariant("SL5-V-EXPIRED", p, true, true);
        v.setStockQty(12);
        v = variantRepository.save(v);
        ProductBatch b = new ProductBatch();
        b.setProduct(p);
        b.setVariant(v);
        b.setBatchCode("B-SL5-DET-EX");
        b.setExpiryDate(LocalDate.of(2026, 5, 8));
        b.setImportQty(12);
        b.setRemainingQty(12);
        b.setCostPrice(BigDecimal.ONE);
        b.setStatus(ProductBatch.STATUS_ACTIVE);
        batchRepository.save(b);

        var resp = productService.findById(p.getId());
        assertEquals(1, resp.variants().size());
        assertEquals(12, resp.variants().get(0).stockQty());
        assertEquals(0, resp.variants().get(0).sellableStockQty());
    }

    @Test
    void productDetail_uses_sellable_stock_from_active_non_expired_batches() {
        when(businessClock.instant()).thenReturn(Instant.parse("2026-05-09T00:00:00Z"));
        when(businessClock.getZone()).thenReturn(ZoneId.of("UTC"));
        Product p = newProduct("SL5-DET-ACT");
        ProductVariant v = newVariant("SL5-V-ACT", p, true, true);
        v.setStockQty(20);
        v = variantRepository.save(v);
        ProductBatch b = new ProductBatch();
        b.setProduct(p);
        b.setVariant(v);
        b.setBatchCode("B-SL5-DET-ACT");
        b.setExpiryDate(LocalDate.of(2026, 5, 10));
        b.setImportQty(9);
        b.setRemainingQty(9);
        b.setCostPrice(BigDecimal.ONE);
        b.setStatus(ProductBatch.STATUS_ACTIVE);
        batchRepository.save(b);

        var resp = productService.findById(p.getId());
        assertEquals(9, resp.variants().get(0).sellableStockQty());
    }

    private Product newProduct(String code) {
        Category cat = new Category();
        cat.setName("CAT-" + code);
        cat.setDescription("t");
        cat.setActive(true);
        cat = categoryRepository.save(cat);
        Product p = new Product();
        p.setCode(code);
        p.setName("N " + code);
        p.setCategory(cat);
        p.setActive(true);
        p.setProductType(Product.ProductType.SINGLE);
        return productRepository.save(p);
    }

    private ProductVariant newVariant(String code, boolean active, boolean sellable) {
        return newVariant(code, newProduct("P-" + code), active, sellable);
    }

    private ProductVariant newVariant(String code, Product p, boolean active, boolean sellable) {
        ProductVariant v = new ProductVariant();
        v.setProduct(p);
        v.setVariantCode(code);
        v.setVariantName("V" + code);
        v.setSellUnit("cai");
        v.setPiecesPerUnit(1);
        v.setSellPrice(BigDecimal.TEN);
        v.setCostPrice(BigDecimal.ONE);
        v.setStockQty(0);
        v.setMinStockQty(0);
        v.setActive(active);
        v.setIsDefault(true);
        v.setIsSellable(sellable);
        return variantRepository.save(v);
    }
}
