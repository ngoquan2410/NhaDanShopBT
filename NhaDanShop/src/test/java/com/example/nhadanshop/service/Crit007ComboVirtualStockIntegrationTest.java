package com.example.nhadanshop.service;

import com.example.nhadanshop.entity.Category;
import com.example.nhadanshop.entity.Product;
import com.example.nhadanshop.entity.ProductComboItem;
import com.example.nhadanshop.entity.ProductVariant;
import com.example.nhadanshop.repository.CategoryRepository;
import com.example.nhadanshop.repository.ProductComboRepository;
import com.example.nhadanshop.repository.ProductRepository;
import com.example.nhadanshop.repository.ProductVariantRepository;
import jakarta.persistence.EntityManager;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;
import org.springframework.context.annotation.Import;

import java.math.BigDecimal;

import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

@DataJpaTest(properties = {
        "spring.flyway.enabled=false",
        "spring.jpa.hibernate.ddl-auto=create-drop"
})
@Import(ProductComboService.class)
class Crit007ComboVirtualStockIntegrationTest {

    @Autowired
    private ProductComboService productComboService;
    @Autowired
    private CategoryRepository categoryRepository;
    @Autowired
    private ProductRepository productRepository;
    @Autowired
    private ProductVariantRepository variantRepository;
    @Autowired
    private ProductComboRepository comboItemRepository;
    @Autowired
    private EntityManager entityManager;

    @Test
    void crit007_comboVirtualStock_throwsWhenComponentStockNegative() {
        Category cat = new Category();
        cat.setName("CAT-CRIT007-CB");
        cat.setDescription("t");
        cat.setActive(true);
        cat = categoryRepository.save(cat);

        Product component = new Product();
        component.setCode("COMP-CRIT007");
        component.setName("Comp");
        component.setCategory(cat);
        component.setActive(true);
        component.setProductType(Product.ProductType.SINGLE);
        component = productRepository.save(component);

        ProductVariant cv = new ProductVariant();
        cv.setProduct(component);
        cv.setVariantCode("COMP-V-CRIT007");
        cv.setVariantName("Comp v");
        cv.setSellUnit("cai");
        cv.setPiecesPerUnit(1);
        cv.setSellPrice(BigDecimal.TEN);
        cv.setCostPrice(BigDecimal.ONE);
        cv.setStockQty(5);
        cv.setMinStockQty(0);
        cv.setActive(true);
        cv.setIsDefault(true);
        cv = variantRepository.save(cv);

        Product combo = new Product();
        combo.setCode("COMBO-CRIT007");
        combo.setName("Combo");
        combo.setCategory(cat);
        combo.setActive(true);
        combo.setProductType(Product.ProductType.COMBO);
        combo = productRepository.save(combo);

        ProductVariant comboV = new ProductVariant();
        comboV.setProduct(combo);
        comboV.setVariantCode(combo.getCode());
        comboV.setVariantName(combo.getName());
        comboV.setSellUnit("combo");
        comboV.setPiecesPerUnit(1);
        comboV.setSellPrice(BigDecimal.valueOf(99));
        comboV.setCostPrice(BigDecimal.ZERO);
        comboV.setStockQty(0);
        comboV.setMinStockQty(0);
        comboV.setActive(true);
        comboV.setIsDefault(true);
        variantRepository.save(comboV);

        ProductComboItem link = new ProductComboItem();
        link.setComboProduct(combo);
        link.setProduct(component);
        link.setQuantity(1);
        comboItemRepository.save(link);

        entityManager.createNativeQuery(
                        "UPDATE product_variants SET stock_qty = :sq WHERE id = :id")
                .setParameter("sq", -1)
                .setParameter("id", cv.getId())
                .executeUpdate();
        entityManager.flush();
        entityManager.clear();

        Product comboReloaded = productRepository.findById(combo.getId()).orElseThrow();
        IllegalStateException ex = assertThrows(
                IllegalStateException.class,
                () -> productComboService.updateVirtualStock(comboReloaded));
        assertTrue(ex.getMessage().contains("Tồn thành phần âm"));
    }
}
