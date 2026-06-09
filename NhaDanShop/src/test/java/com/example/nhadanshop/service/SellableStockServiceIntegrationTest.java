package com.example.nhadanshop.service;

import com.example.nhadanshop.entity.Category;
import com.example.nhadanshop.entity.Product;
import com.example.nhadanshop.entity.ProductBatch;
import com.example.nhadanshop.entity.ProductComboItem;
import com.example.nhadanshop.entity.ProductVariant;
import com.example.nhadanshop.repository.CategoryRepository;
import com.example.nhadanshop.repository.ProductBatchRepository;
import com.example.nhadanshop.repository.ProductComboRepository;
import com.example.nhadanshop.repository.ProductRepository;
import com.example.nhadanshop.repository.ProductVariantRepository;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;
import org.springframework.context.annotation.Import;

import java.math.BigDecimal;
import java.time.LocalDate;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

@DataJpaTest(properties = {
        "spring.flyway.enabled=false",
        "spring.jpa.hibernate.ddl-auto=create-drop"
})
@Import(SellableStockService.class)
class SellableStockServiceIntegrationTest {

    @Autowired
    private SellableStockService sellableStockService;
    @Autowired
    private CategoryRepository categoryRepository;
    @Autowired
    private ProductRepository productRepository;
    @Autowired
    private ProductVariantRepository variantRepository;
    @Autowired
    private ProductBatchRepository batchRepository;
    @Autowired
    private ProductComboRepository comboRepository;

    @Test
    void variant_sales_sellable_uses_batch_truth_not_stock_projection() {
        LocalDate today = LocalDate.of(2026, 4, 14);
        ProductVariant variant = createSingleVariant("SST-VAR");
        variant.setStockQty(100);
        variantRepository.save(variant);

        assertThrows(
                IllegalArgumentException.class,
                () -> sellableStockService.assertVariantSalesSellable(variant, 1, today, "gift"));

        variant.setStockQty(0);
        variantRepository.save(variant);
        createBatch(variant, "ACTIVE", today.plusDays(10), 3, ProductBatch.STATUS_ACTIVE);

        sellableStockService.assertVariantSalesSellable(variant.getId(), 3, today, "gift");
        assertEquals(3, sellableStockService.salesSellableQtyByVariantId(variant.getId(), today));
    }

    @Test
    void combo_sellable_uses_component_batch_truth_not_stock_projection() {
        LocalDate today = LocalDate.of(2026, 4, 14);
        ProductVariant component = createSingleVariant("SST-COMP");
        component.setStockQty(100);
        component = variantRepository.save(component);
        Product combo = createCombo("SST-COMBO", component.getProduct(), 2);

        assertThrows(
                IllegalArgumentException.class,
                () -> sellableStockService.assertComboSalesSellable(combo, 1, today, "combo"));

        component.setStockQty(0);
        variantRepository.save(component);
        createBatch(component, "COMP-ACTIVE", today.plusDays(10), 4, ProductBatch.STATUS_ACTIVE);
        createBatch(component, "COMP-EXPIRED", today.minusDays(1), 100, ProductBatch.STATUS_ACTIVE);
        createBatch(component, "COMP-VOIDED", today.plusDays(10), 100, ProductBatch.STATUS_VOIDED);

        assertEquals(2, sellableStockService.comboSellableQty(combo, today));
        sellableStockService.assertComboSalesSellable(combo, 2, today, "combo");
        assertThrows(
                IllegalArgumentException.class,
                () -> sellableStockService.assertComboSalesSellable(combo, 3, today, "combo"));
    }

    private ProductVariant createSingleVariant(String code) {
        Category category = new Category();
        category.setName("CAT-" + code);
        category.setDescription("test");
        category.setActive(true);
        category = categoryRepository.save(category);

        Product product = new Product();
        product.setCode("P-" + code);
        product.setName("Product " + code);
        product.setCategory(category);
        product.setActive(true);
        product.setProductType(Product.ProductType.SINGLE);
        product = productRepository.save(product);

        ProductVariant variant = new ProductVariant();
        variant.setProduct(product);
        variant.setVariantCode(code);
        variant.setVariantName("Variant " + code);
        variant.setSellUnit("cai");
        variant.setPiecesPerUnit(1);
        variant.setSellPrice(BigDecimal.TEN);
        variant.setCostPrice(BigDecimal.ONE);
        variant.setStockQty(0);
        variant.setMinStockQty(0);
        variant.setActive(true);
        variant.setIsSellable(true);
        variant.setIsDefault(true);
        return variantRepository.save(variant);
    }

    private Product createCombo(String code, Product componentProduct, int componentQty) {
        Product combo = new Product();
        combo.setCode("P-" + code);
        combo.setName("Combo " + code);
        combo.setCategory(componentProduct.getCategory());
        combo.setActive(true);
        combo.setProductType(Product.ProductType.COMBO);
        combo = productRepository.save(combo);

        ProductComboItem item = new ProductComboItem();
        item.setComboProduct(combo);
        item.setProduct(componentProduct);
        item.setQuantity(componentQty);
        comboRepository.save(item);
        return combo;
    }

    private ProductBatch createBatch(ProductVariant variant, String suffix, LocalDate expiryDate, int qty, String status) {
        ProductBatch batch = new ProductBatch();
        batch.setProduct(variant.getProduct());
        batch.setVariant(variant);
        batch.setBatchCode("B-" + suffix + "-" + variant.getVariantCode());
        batch.setExpiryDate(expiryDate);
        batch.setImportQty(qty);
        batch.setRemainingQty(qty);
        batch.setCostPrice(BigDecimal.ONE);
        batch.setStatus(status);
        return batchRepository.save(batch);
    }
}
