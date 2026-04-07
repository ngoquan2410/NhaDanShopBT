package com.example.nhadanshop.repository;

import com.example.nhadanshop.entity.InventoryReceiptItem;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface InventoryReceiptItemRepository extends JpaRepository<InventoryReceiptItem, Long> {

    List<InventoryReceiptItem> findByReceiptId(Long receiptId);
}
