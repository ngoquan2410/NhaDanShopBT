package com.example.nhadanshop.repository;

import com.example.nhadanshop.entity.Category;
import com.example.nhadanshop.entity.Product;
import com.example.nhadanshop.entity.ProductBatch;
import com.example.nhadanshop.entity.ProductVariant;
import jakarta.persistence.EntityManager;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * {@link ProductBatchRepository#findCurrentAdjustableByVariantIdForUpdate} is the sole driver for unsourced negative ADJ.
 */
@DataJpaTest(
        showSql = false,
        properties = {
                "spring.flyway.enabled=false",
                "spring.jpa.hibernate.ddl-auto=create-drop"
        }
)
class ProductBatchRepositoryCurrentAdjustableSlice5bTest {

    @Autowired
    private ProductBatchRepository productBatchRepository;
    @Autowired
    private ProductVariantRepository productVariantRepository;
    @Autowired
    private ProductRepository productRepository;
    @Autowired
    private CategoryRepository categoryRepository;
    @Autowired
    private EntityManager em;

    @Test
    @Transactional
    void findCurrentAdjustable_forUpdate_returns_active_and_blocked_only_fefo_order() {
        ProductVariant v = newVariant("V-ADJ-REPO");
        ProductBatch a = newBatch(v, "BA", LocalDate.now().plusDays(10), 2, 2, ProductBatch.STATUS_ACTIVE);
        ProductBatch b = newBatch(v, "BB", LocalDate.now().plusDays(5), 1, 1, ProductBatch.STATUS_BLOCKED);
        ProductBatch c = newBatch(v, "BC", LocalDate.now().plusDays(1), 9, 9, ProductBatch.STATUS_ARCHIVED);
        em.flush();
        List<ProductBatch> rows = productBatchRepository.findCurrentAdjustableByVariantIdForUpdate(v.getId());
        assertEquals(2, rows.size());
        assertTrue(rows.stream().allMatch(x ->
                ProductBatch.STATUS_ACTIVE.equals(x.getStatus()) || ProductBatch.STATUS_BLOCKED.equals(x.getStatus())));
        // expiry: BB (day+5) before BA (day+10); tie-break id
        assertEquals(b.getId(), rows.get(0).getId());
        assertEquals(a.getId(), rows.get(1).getId());
        assertTrue(rows.stream().noneMatch(x -> x.getId().equals(c.getId())));
    }

    private ProductVariant newVariant(String code) {
        Category c = new Category();
        c.setName("C-" + code);
        c.setDescription("t");
        c.setActive(true);
        c = categoryRepository.save(c);
        Product p = new Product();
        p.setCode("P-REPO-ADJ-" + code);
        p.setName("P");
        p.setCategory(c);
        p.setActive(true);
        p.setProductType(Product.ProductType.SINGLE);
        p = productRepository.save(p);
        ProductVariant v = new ProductVariant();
        v.setProduct(p);
        v.setVariantCode(code);
        v.setVariantName("V");
        v.setSellUnit("c");
        v.setPiecesPerUnit(1);
        v.setSellPrice(new BigDecimal("1"));
        v.setCostPrice(new BigDecimal("1"));
        v.setStockQty(0);
        v.setMinStockQty(0);
        v.setActive(true);
        v.setIsDefault(true);
        return productVariantRepository.save(v);
    }

    private ProductBatch newBatch(
            ProductVariant v, String code, LocalDate exp, int imp, int rem, String status) {
        ProductBatch b = new ProductBatch();
        b.setProduct(v.getProduct());
        b.setVariant(v);
        b.setBatchCode("BATCH-" + code + "-" + System.nanoTime());
        b.setExpiryDate(exp);
        b.setImportQty(imp);
        b.setRemainingQty(rem);
        b.setCostPrice(new BigDecimal("1"));
        b.setStatus(status);
        return productBatchRepository.save(b);
    }
}
