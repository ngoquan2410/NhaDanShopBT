package com.example.nhadanshop.repository;

import com.example.nhadanshop.entity.ProductImportUnit;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

/**
 * Repository cho bảng product_import_units.
 *
 * Bảng này lưu các đơn vị nhập kho đã đăng ký cho từng SP,
 * dùng làm GỢI Ý MẶC ĐỊNH khi tạo phiếu nhập (không phải immutable rule).
 */
@Repository
public interface ProductImportUnitRepository extends JpaRepository<ProductImportUnit, Long> {

    /** Tất cả đơn vị đã đăng ký của 1 SP, default lên trước */
    List<ProductImportUnit> findByProductIdOrderByIsDefaultDescImportUnitAsc(Long productId);

    /** Lookup đơn vị cụ thể theo SP + tên ĐV (case-insensitive) — dùng khi import Excel */
    Optional<ProductImportUnit> findByProductIdAndImportUnitIgnoreCase(Long productId, String importUnit);

    /** Lấy đơn vị mặc định của 1 SP — điền sẵn vào form */
    Optional<ProductImportUnit> findByProductIdAndIsDefaultTrue(Long productId);

    /** Kiểm tra SP có đã đăng ký đơn vị nào chưa */
    boolean existsByProductId(Long productId);

    /** Xóa tất cả đơn vị của 1 SP (dùng khi delete SP) */
    void deleteByProductId(Long productId);

    /**
     * Đổi default: bỏ is_default của tất cả ĐV cũ của SP,
     * sau đó service sẽ set is_default=TRUE cho ĐV mới.
     */
    @Modifying
    @Query("UPDATE ProductImportUnit u SET u.isDefault = FALSE WHERE u.product.id = :productId")
    void clearDefaultByProductId(@Param("productId") Long productId);

    /**
     * Lấy tên tất cả đơn vị đã đăng ký của 1 SP — dùng cho error message.
     * VD: ["kg", "xâu", "bịch"]
     */
    @Query("SELECT u.importUnit FROM ProductImportUnit u WHERE u.product.id = :productId ORDER BY u.isDefault DESC, u.importUnit ASC")
    List<String> findImportUnitNamesByProductId(@Param("productId") Long productId);
}
