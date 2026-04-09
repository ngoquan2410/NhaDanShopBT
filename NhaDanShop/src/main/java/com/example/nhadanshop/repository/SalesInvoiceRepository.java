package com.example.nhadanshop.repository;

import com.example.nhadanshop.entity.SalesInvoice;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;

@Repository
public interface SalesInvoiceRepository extends JpaRepository<SalesInvoice, Long> {

    Optional<SalesInvoice> findByInvoiceNo(String invoiceNo);

    /**
     * Lấy số thứ tự lớn nhất của invoice_no theo ngày, ví dụ prefix = "INV-20260321-"
     * Trả về max sequence (phần số cuối) hoặc 0 nếu chưa có.
     */
    @Query(value = """
            SELECT COALESCE(MAX(CAST(SUBSTRING(invoice_no, LENGTH(:prefix) + 1, 10) AS INT)), 0)
            FROM sales_invoices
            WHERE invoice_no LIKE :prefixPattern
            """, nativeQuery = true)
    int findMaxSeqForPrefix(@Param("prefix") String prefix, @Param("prefixPattern") String prefixPattern);

    Page<SalesInvoice> findByInvoiceDateBetweenOrderByInvoiceDateDesc(
            LocalDateTime from, LocalDateTime to, Pageable pageable);

    Page<SalesInvoice> findAllByOrderByInvoiceDateDesc(Pageable pageable);

    /** Tổng doanh thu trong khoảng thời gian */
    @Query("""
            SELECT COALESCE(SUM(i.totalAmount), 0)
            FROM SalesInvoice i
            WHERE i.invoiceDate BETWEEN :from AND :to
            """)
    BigDecimal sumTotalAmountBetween(
            @Param("from") LocalDateTime from,
            @Param("to") LocalDateTime to);

    /** Tổng lợi nhuận (sum profit từ items) trong khoảng thời gian */
    @Query("""
            SELECT COALESCE(SUM(item.quantity * (item.unitPrice - item.unitCostSnapshot)), 0)
            FROM SalesInvoiceItem item
            WHERE item.invoice.invoiceDate BETWEEN :from AND :to
            """)
    BigDecimal sumProfitBetween(
            @Param("from") LocalDateTime from,
            @Param("to") LocalDateTime to);

    /** Tổng chi phí vốn trong khoảng thời gian */
    @Query("""
            SELECT COALESCE(SUM(item.quantity * item.unitCostSnapshot), 0)
            FROM SalesInvoiceItem item
            WHERE item.invoice.invoiceDate BETWEEN :from AND :to
            """)
    BigDecimal sumCostBetween(
            @Param("from") LocalDateTime from,
            @Param("to") LocalDateTime to);

    /** Tổng tiền giảm từ khuyến mãi trong khoảng thời gian */
    @Query("""
            SELECT COALESCE(SUM(i.discountAmount), 0)
            FROM SalesInvoice i
            WHERE i.invoiceDate BETWEEN :from AND :to
            """)
    BigDecimal sumDiscountAmountBetween(
            @Param("from") LocalDateTime from,
            @Param("to") LocalDateTime to);

    /** Đếm số hóa đơn trong khoảng thời gian */
    long countByInvoiceDateBetween(LocalDateTime from, LocalDateTime to);

    /**
     * Tổng số lượng xuất kho (bán) của từng sản phẩm trong khoảng thời gian.
     * Trả về mảng Object[]: [productId (Long), totalQty (Long)]
     */
    @Query("""
            SELECT item.product.id, COALESCE(SUM(item.quantity), 0)
            FROM SalesInvoiceItem item
            WHERE item.invoice.invoiceDate BETWEEN :from AND :to
            GROUP BY item.product.id
            """)
    List<Object[]> sumSoldQtyByProductBetween(
            @Param("from") LocalDateTime from,
            @Param("to") LocalDateTime to);

    /**
     * [Sprint 0] Tổng số lượng bán của từng VARIANT trong khoảng thời gian.
     * Trả về Object[]: [variantId (Long), totalQty (Long)]
     */
    @Query("""
            SELECT item.variant.id, COALESCE(SUM(item.quantity), 0)
            FROM SalesInvoiceItem item
            WHERE item.variant IS NOT NULL
              AND item.invoice.invoiceDate BETWEEN :from AND :to
            GROUP BY item.variant.id
            """)
    List<Object[]> sumSoldQtyByVariantBetween(
            @Param("from") LocalDateTime from,
            @Param("to") LocalDateTime to);

    /**
     * [Fix OpeningStock] Tổng số lượng bán của từng VARIANT từ một mốc thời gian trở đi
     * (không giới hạn trên = toàn bộ lịch sử từ fromDt đến nay).
     * Dùng để tính ngược tồn đầu kỳ:
     *   openingStock = currentStock - recvAfter(fromDt) + soldAfter(fromDt)
     * Trả về Object[]: [variantId (Long), totalQty (Long)]
     */
    @Query("""
            SELECT item.variant.id, COALESCE(SUM(item.quantity), 0)
            FROM SalesInvoiceItem item
            WHERE item.variant IS NOT NULL
              AND item.invoice.invoiceDate >= :from
            GROUP BY item.variant.id
            """)
    List<Object[]> sumSoldQtyByVariantAfter(
            @Param("from") LocalDateTime from);

    // ─── Revenue by Product ───────────────────────────────────────────────────

    /**
     * Doanh thu theo từng sản phẩm trong khoảng thời gian.
     * Object[]: [productId, productCode, productName, categoryName, unit, totalQty, totalAmount]
     * Dùng COALESCE để tránh NPE khi variant IS NULL (data cũ trước V22).
     */
    @Query("""
            SELECT item.product.id,
                   item.product.code,
                   item.product.name,
                   item.product.category.name,
                   COALESCE(item.variant.sellUnit, 'cai'),
                   COALESCE(SUM(item.quantity), 0),
                   COALESCE(SUM(item.quantity * item.unitPrice), 0)
            FROM SalesInvoiceItem item
            WHERE item.invoice.invoiceDate BETWEEN :from AND :to
            GROUP BY item.product.id, item.product.code, item.product.name,
                     item.product.category.name, item.variant.sellUnit
            ORDER BY COALESCE(SUM(item.quantity * item.unitPrice), 0) DESC
            """)
    List<Object[]> revenueByProduct(
            @Param("from") LocalDateTime from,
            @Param("to") LocalDateTime to);

    // ─── Revenue by Category ─────────────────────────────────────────────────

    /**
     * Doanh thu theo từng danh mục.
     * Object[]: [categoryId, categoryName, totalAmount]
     */
    @Query("""
            SELECT item.product.category.id,
                   item.product.category.name,
                   COALESCE(SUM(item.quantity * item.unitPrice), 0)
            FROM SalesInvoiceItem item
            WHERE item.invoice.invoiceDate BETWEEN :from AND :to
            GROUP BY item.product.category.id, item.product.category.name
            ORDER BY COALESCE(SUM(item.quantity * item.unitPrice), 0) DESC
            """)
    List<Object[]> revenueByCategory(
            @Param("from") LocalDateTime from,
            @Param("to") LocalDateTime to);

    // ─── Daily revenue (group by date) ───────────────────────────────────────

    /**
     * Tổng doanh thu từng ngày — PostgreSQL syntax.
     * Object[]: [sale_date (java.sql.Date), total (BigDecimal)]
     */
    @Query(value = """
            SELECT invoice_date::DATE             AS sale_date,
                   COALESCE(SUM(total_amount), 0) AS total
            FROM sales_invoices
            WHERE invoice_date BETWEEN :from AND :to
            GROUP BY invoice_date::DATE
            ORDER BY invoice_date::DATE
            """, nativeQuery = true)
    List<Object[]> dailyRevenue(
            @Param("from") LocalDateTime from,
            @Param("to") LocalDateTime to);

    // ─── Filter by Customer (Sprint 2) ───────────────────────────────────────

    /** Lấy hóa đơn theo KH — sort theo ngày mới nhất */
    Page<SalesInvoice> findByCustomerIdOrderByInvoiceDateDesc(Long customerId, Pageable pageable);

    // ��── Top Products (Sprint 2) ──────────────────────────────────────────────

    /**
     * Top variant bán chạy nhất theo doanh thu trong kỳ.
     * Object[]: [variantId, variantCode, variantName, productId, productCode, productName,
     *            categoryName, sellUnit, totalQty, totalRevenue, totalProfit]
     */
    @Query("""
            SELECT sii.variant.id,
                   sii.variant.variantCode,
                   sii.variant.variantName,
                   sii.product.id,
                   sii.product.code,
                   sii.product.name,
                   sii.product.category.name,
                   sii.variant.sellUnit,
                   COALESCE(SUM(sii.quantity), 0),
                   COALESCE(SUM(sii.quantity * sii.unitPrice), 0),
                   COALESCE(SUM(sii.quantity * (sii.unitPrice - sii.unitCostSnapshot)), 0)
            FROM SalesInvoiceItem sii
            WHERE sii.variant IS NOT NULL
              AND sii.invoice.invoiceDate BETWEEN :from AND :to
            GROUP BY sii.variant.id, sii.variant.variantCode, sii.variant.variantName,
                     sii.product.id, sii.product.code, sii.product.name,
                     sii.product.category.name, sii.variant.sellUnit
            ORDER BY COALESCE(SUM(sii.quantity), 0) DESC
            """)
    List<Object[]> topProducts(
            @Param("from") LocalDateTime from,
            @Param("to") LocalDateTime to,
            Pageable pageable);

    /**
     * Variants có giao dịch gần nhất — dùng để tính slow products.
     * Object[]: [variantId, lastSaleDate]
     */
    @Query("""
            SELECT sii.variant.id,
                   MAX(sii.invoice.invoiceDate)
            FROM SalesInvoiceItem sii
            WHERE sii.variant IS NOT NULL
            GROUP BY sii.variant.id
            """)
    List<Object[]> lastSaleDateByVariant();
}
