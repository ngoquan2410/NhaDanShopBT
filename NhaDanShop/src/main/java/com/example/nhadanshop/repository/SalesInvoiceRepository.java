package com.example.nhadanshop.repository;

import com.example.nhadanshop.entity.SalesInvoice;
import jakarta.persistence.LockModeType;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.EntityGraph.EntityGraphType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.Collection;
import java.util.List;
import java.util.Optional;

@Repository
public interface SalesInvoiceRepository extends JpaRepository<SalesInvoice, Long> {

    Optional<SalesInvoice> findByInvoiceNo(String invoiceNo);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("SELECT i FROM SalesInvoice i WHERE i.id = :id")
    Optional<SalesInvoice> findByIdForUpdate(@Param("id") Long id);

    @Query(value = """
            SELECT COALESCE(MAX(CAST(SUBSTRING(invoice_no, LENGTH(:prefix) + 1, 10) AS INT)), 0)
            FROM sales_invoices
            WHERE invoice_no LIKE :prefixPattern
            """, nativeQuery = true)
    int findMaxSeqForPrefix(@Param("prefix") String prefix, @Param("prefixPattern") String prefixPattern);

    Page<SalesInvoice> findByInvoiceDateBetweenOrderByInvoiceDateDesc(
            LocalDateTime from, LocalDateTime to, Pageable pageable);

    Page<SalesInvoice> findAllByOrderByInvoiceDateDesc(Pageable pageable);

    @EntityGraph(attributePaths = {"createdBy", "customer", "items", "items.product", "items.variant"})
    @Query("SELECT i FROM SalesInvoice i ORDER BY i.invoiceDate DESC")
    Page<SalesInvoice> findAllWithDetails(Pageable pageable);

    @Query("""
            SELECT i.id
            FROM SalesInvoice i
            ORDER BY i.invoiceDate DESC, i.id DESC
            """)
    Page<Long> findInvoiceIdsForList(Pageable pageable);

    @EntityGraph(type = EntityGraphType.FETCH, attributePaths = {"createdBy", "customer", "items", "items.product", "items.variant"})
    @Query("""
            SELECT DISTINCT i
            FROM SalesInvoice i
            WHERE i.id IN :ids
            """)
    List<SalesInvoice> findAllByIdInForList(@Param("ids") Collection<Long> ids);

    /**
     * GET /api/invoices/{id} — same eager roots as list paths.
     * Does not include {@code items.batchAllocations} in the graph: Hibernate cannot fetch two
     * List (bag) associations in one query ({@code SalesInvoice.items} plus
     * {@code SalesInvoiceItem.batchAllocations}) without {@code MultipleBagFetchException}.
     * Allocations and batches load lazily within the transactional {@code getInvoice} call.
     */
    @EntityGraph(type = EntityGraphType.FETCH, attributePaths = {
            "createdBy", "customer",
            "items", "items.product", "items.variant"
    })
    @Query("SELECT i FROM SalesInvoice i WHERE i.id = :id")
    Optional<SalesInvoice> findByIdForResponse(@Param("id") Long id);

    @Query("""
            SELECT COALESCE(SUM(i.totalAmount), 0)
            FROM SalesInvoice i
            WHERE i.invoiceDate BETWEEN :from AND :to
              AND i.status = 'COMPLETED'
            """)
    BigDecimal sumTotalAmountBetween(
            @Param("from") LocalDateTime from,
            @Param("to") LocalDateTime to);

    /**
     * Slice 6C: item-level gross profit — line revenue (qty × unit price) − line COGS (no invoice-wide proportional allocation).
     * Shipping/fees remain at invoice aggregate; excluded from product rollups.
     */
    @Query("""
            SELECT COALESCE(SUM(
                (item.quantity * item.unitPrice)
                - (item.quantity * item.unitCostSnapshot)
            ), 0)
            FROM SalesInvoiceItem item
            WHERE item.invoice.invoiceDate BETWEEN :from AND :to
              AND item.invoice.status = 'COMPLETED'
            """)
    BigDecimal sumProfitBetween(
            @Param("from") LocalDateTime from,
            @Param("to") LocalDateTime to);

    @Query("""
            SELECT COALESCE(SUM(item.quantity * item.unitCostSnapshot), 0)
            FROM SalesInvoiceItem item
            WHERE item.invoice.invoiceDate BETWEEN :from AND :to
              AND item.invoice.status = 'COMPLETED'
            """)
    BigDecimal sumCostBetween(
            @Param("from") LocalDateTime from,
            @Param("to") LocalDateTime to);

    @Query("""
            SELECT COALESCE(SUM(i.discountAmount), 0)
            FROM SalesInvoice i
            WHERE i.invoiceDate BETWEEN :from AND :to
              AND i.status = 'COMPLETED'
            """)
    BigDecimal sumDiscountAmountBetween(
            @Param("from") LocalDateTime from,
            @Param("to") LocalDateTime to);

    @Query("""
            SELECT i.pricingBreakdownSnapshotJson
            FROM SalesInvoice i
            WHERE i.invoiceDate BETWEEN :from AND :to
              AND i.status = 'COMPLETED'
              AND i.pricingBreakdownSnapshotJson IS NOT NULL
            """)
    List<String> findPricingSnapshotJsonBetween(
            @Param("from") LocalDateTime from,
            @Param("to") LocalDateTime to);

    long countByInvoiceDateBetweenAndStatus(LocalDateTime from, LocalDateTime to, SalesInvoice.Status status);

    @Query("""
            SELECT item.product.id, COALESCE(SUM(item.quantity), 0)
            FROM SalesInvoiceItem item
            WHERE item.invoice.invoiceDate BETWEEN :from AND :to
              AND item.invoice.status = 'COMPLETED'
            GROUP BY item.product.id
            """)
    List<Object[]> sumSoldQtyByProductBetween(
            @Param("from") LocalDateTime from,
            @Param("to") LocalDateTime to);

    @Query("""
            SELECT item.variant.id, COALESCE(SUM(item.quantity), 0)
            FROM SalesInvoiceItem item
            WHERE item.variant IS NOT NULL
              AND item.invoice.invoiceDate BETWEEN :from AND :to
              AND item.invoice.status = 'COMPLETED'
            GROUP BY item.variant.id
            """)
    List<Object[]> sumSoldQtyByVariantBetween(
            @Param("from") LocalDateTime from,
            @Param("to") LocalDateTime to);

    @Query("""
            SELECT item.variant.id, COALESCE(SUM(item.quantity), 0)
            FROM SalesInvoiceItem item
            WHERE item.variant IS NOT NULL
              AND item.invoice.invoiceDate >= :from
              AND item.invoice.status = 'COMPLETED'
            GROUP BY item.variant.id
            """)
    List<Object[]> sumSoldQtyByVariantAfter(@Param("from") LocalDateTime from);

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
              AND item.invoice.status = 'COMPLETED'
            GROUP BY item.product.id, item.product.code, item.product.name,
                     item.product.category.name, item.variant.sellUnit
            ORDER BY COALESCE(SUM(item.quantity * item.unitPrice), 0) DESC
            """)
    List<Object[]> revenueByProduct(
            @Param("from") LocalDateTime from,
            @Param("to") LocalDateTime to);

    @Query("""
            SELECT item.product.category.id,
                   item.product.category.name,
                   COALESCE(SUM(item.quantity * item.unitPrice), 0)
            FROM SalesInvoiceItem item
            WHERE item.invoice.invoiceDate BETWEEN :from AND :to
              AND item.invoice.status = 'COMPLETED'
            GROUP BY item.product.category.id, item.product.category.name
            ORDER BY COALESCE(SUM(item.quantity * item.unitPrice), 0) DESC
            """)
    List<Object[]> revenueByCategory(
            @Param("from") LocalDateTime from,
            @Param("to") LocalDateTime to);

    /**
     * Doanh thu ròng theo ngày (tổng total_amount − discount_amount), chỉ HĐ COMPLETED.
     * JPQL portable (CRIT-005); thay native SUM(total_amount) gross.
     */
    @Query("""
            SELECT CAST(i.invoiceDate AS date),
                   COALESCE(SUM(i.totalAmount - COALESCE(i.discountAmount, 0)), 0)
            FROM SalesInvoice i
            WHERE i.invoiceDate BETWEEN :from AND :to
              AND i.status = 'COMPLETED'
            GROUP BY CAST(i.invoiceDate AS date)
            ORDER BY CAST(i.invoiceDate AS date)
            """)
    List<Object[]> dailyRevenue(
            @Param("from") LocalDateTime from,
            @Param("to") LocalDateTime to);

    Page<SalesInvoice> findByCustomerIdOrderByInvoiceDateDesc(Long customerId, Pageable pageable);

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
                   COALESCE(SUM(
                       (sii.quantity * sii.unitPrice) - (sii.quantity * sii.unitCostSnapshot)
                   ), 0)
            FROM SalesInvoiceItem sii
            WHERE sii.variant IS NOT NULL
              AND sii.invoice.invoiceDate BETWEEN :from AND :to
              AND sii.invoice.status = 'COMPLETED'
            GROUP BY sii.variant.id, sii.variant.variantCode, sii.variant.variantName,
                     sii.product.id, sii.product.code, sii.product.name,
                     sii.product.category.name, sii.variant.sellUnit
            ORDER BY COALESCE(SUM(sii.quantity * sii.unitPrice), 0) DESC
            """)
    List<Object[]> topProducts(
            @Param("from") LocalDateTime from,
            @Param("to") LocalDateTime to,
            Pageable pageable);

    @Query("""
            SELECT sii.variant.id,
                   MAX(sii.invoice.invoiceDate)
            FROM SalesInvoiceItem sii
            WHERE sii.variant IS NOT NULL
              AND sii.invoice.status = 'COMPLETED'
            GROUP BY sii.variant.id
            """)
    List<Object[]> lastSaleDateByVariant();

    long countByPromotionId(Long promotionId);

    /**
     * Promotion id in JSON only (e.g. legacy rows) — conservative reference check for void/archive policy.
     */
    @Query(value = """
            SELECT EXISTS (
                SELECT 1 FROM sales_invoices i
                WHERE
                    (i.promotion_snapshot_json IS NOT NULL
                    AND (i.promotion_snapshot_json::jsonb->>'promotionId') = CAST(:id AS text))
                 OR (i.gift_lines_snapshot_json IS NOT NULL
                    AND EXISTS (SELECT 1 FROM jsonb_array_elements(COALESCE(i.gift_lines_snapshot_json::jsonb, '[]'::jsonb)) g
                    WHERE (g->>'promotionId') = CAST(:id AS text))
            )
            """, nativeQuery = true)
    boolean existsReferenceToPromotionInInvoiceJsonSnapshots(@Param("id") long id);
}
