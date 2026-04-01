package com.example.nhadanshop.repository;

import com.example.nhadanshop.entity.Product;
import com.example.nhadanshop.entity.ProductComboItem;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface ProductComboRepository extends JpaRepository<ProductComboItem, Long> {

    /** Tất cả thành phần của 1 combo product */
    List<ProductComboItem> findByComboProduct(Product comboProduct);

    /** Xóa tất cả thành phần của 1 combo */
    void deleteByComboProduct(Product comboProduct);

    /** SP đơn lẻ nào đang được dùng trong combo nào */
    @Query("SELECT i FROM ProductComboItem i WHERE i.product.id = :productId")
    List<ProductComboItem> findByProductId(Long productId);
}
