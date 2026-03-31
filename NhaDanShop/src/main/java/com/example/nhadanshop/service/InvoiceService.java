package com.example.nhadanshop.service;

import com.example.nhadanshop.dto.InvoiceItemRequest;
import com.example.nhadanshop.dto.SalesInvoiceRequest;
import com.example.nhadanshop.dto.SalesInvoiceResponse;
import com.example.nhadanshop.entity.Product;
import com.example.nhadanshop.entity.Promotion;
import com.example.nhadanshop.entity.SalesInvoice;
import com.example.nhadanshop.entity.SalesInvoiceItem;
import com.example.nhadanshop.repository.ProductRepository;
import com.example.nhadanshop.repository.PromotionRepository;
import com.example.nhadanshop.repository.SalesInvoiceRepository;
import com.example.nhadanshop.repository.UserRepository;
import jakarta.persistence.EntityNotFoundException;
import jakarta.transaction.Transactional;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;

@Service
@RequiredArgsConstructor
@Transactional
public class InvoiceService {

    private final SalesInvoiceRepository invoiceRepo;
    private final ProductRepository productRepo;
    private final UserRepository userRepo;
    private final InvoiceNumberGenerator numberGen;
    private final ProductBatchService batchService;
    private final PromotionRepository promotionRepo;

    @Transactional
    public SalesInvoiceResponse createInvoice(SalesInvoiceRequest req) {
        SalesInvoice invoice = new SalesInvoice();
        invoice.setInvoiceNo(numberGen.nextInvoiceNo());
        invoice.setCustomerName(req.customerName());
        invoice.setNote(req.note());
        invoice.setInvoiceDate(LocalDateTime.now());

        String currentUsername = SecurityContextHolder.getContext().getAuthentication().getName();
        userRepo.findByUsername(currentUsername).ifPresent(invoice::setCreatedBy);

        BigDecimal totalAmount = BigDecimal.ZERO;
        List<SalesInvoiceItem> items = new ArrayList<>();

        for (InvoiceItemRequest itemReq : req.items()) {
            Product product = productRepo.findById(itemReq.productId())
                    .orElseThrow(() -> new EntityNotFoundException(
                            "Khong tim thay san pham ID: " + itemReq.productId()));

            if (!product.getActive()) {
                throw new IllegalArgumentException(
                        "San pham '" + product.getName() + "' da ngung kinh doanh");
            }
            if (product.getStockQty() < itemReq.quantity()) {
                throw new IllegalArgumentException(
                        "San pham '" + product.getName() + "' khong du hang. " +
                        "Ton kho: " + product.getStockQty() + ", yeu cau: " + itemReq.quantity());
            }

            BigDecimal fefoAvgCost = batchService.deductStockFEFOAndComputeCost(
                    product.getId(), itemReq.quantity());

            product.setStockQty(product.getStockQty() - itemReq.quantity());
            product.setUpdatedAt(LocalDateTime.now());
            productRepo.save(product);

            SalesInvoiceItem item = new SalesInvoiceItem();
            item.setInvoice(invoice);
            item.setProduct(product);
            item.setQuantity(itemReq.quantity());
            item.setUnitPrice(product.getSellPrice());
            item.setUnitCostSnapshot(fefoAvgCost.compareTo(BigDecimal.ZERO) > 0
                    ? fefoAvgCost : product.getCostPrice());

            totalAmount = totalAmount.add(
                    product.getSellPrice().multiply(BigDecimal.valueOf(itemReq.quantity())));
            items.add(item);
        }

        invoice.setTotalAmount(totalAmount);
        invoice.getItems().addAll(items);

        // Apply promotion discount
        BigDecimal discountAmount = BigDecimal.ZERO;
        if (req.promotionId() != null) {
            Promotion promo = promotionRepo.findById(req.promotionId()).orElse(null);
            if (promo != null && promo.isCurrentlyActive()) {
                discountAmount = computeDiscount(promo, totalAmount);
                invoice.setPromotionId(promo.getId());
                invoice.setPromotionName(promo.getName());
            }
        }
        invoice.setDiscountAmount(discountAmount);

        SalesInvoice saved = invoiceRepo.save(invoice);
        return DtoMapper.toResponse(saved);
    }

    /**
     * Tinh so tien giam tu khuyen mai.
     * PERCENT_DISCOUNT: giam % tong HĐ, co the cap boi maxDiscount
     * FIXED_DISCOUNT  : giam so tien co dinh
     * FREE_SHIPPING, BUY_X_GET_Y: ghi nhan ten KM, khong tu dong tru tien
     */
    private BigDecimal computeDiscount(Promotion promo, BigDecimal totalAmount) {
        if (totalAmount.compareTo(promo.getMinOrderValue()) < 0) {
            return BigDecimal.ZERO;
        }
        return switch (promo.getType()) {
            case "PERCENT_DISCOUNT" -> {
                BigDecimal pct = promo.getDiscountValue()
                        .divide(BigDecimal.valueOf(100), 10, RoundingMode.HALF_UP);
                BigDecimal disc = totalAmount.multiply(pct).setScale(0, RoundingMode.HALF_UP);
                if (promo.getMaxDiscount() != null && disc.compareTo(promo.getMaxDiscount()) > 0) {
                    disc = promo.getMaxDiscount();
                }
                yield disc;
            }
            case "FIXED_DISCOUNT" -> {
                BigDecimal disc = promo.getDiscountValue();
                yield disc.compareTo(totalAmount) > 0 ? totalAmount : disc;
            }
            default -> BigDecimal.ZERO;
        };
    }

    public SalesInvoiceResponse getInvoice(Long id) {
        SalesInvoice inv = invoiceRepo.findById(id)
                .orElseThrow(() -> new EntityNotFoundException("Khong tim thay hoa don ID: " + id));
        return DtoMapper.toResponse(inv);
    }

    public Page<SalesInvoiceResponse> listInvoices(Pageable pageable) {
        return invoiceRepo.findAllByOrderByInvoiceDateDesc(pageable)
                .map(DtoMapper::toResponse);
    }

    public Page<SalesInvoiceResponse> listInvoicesByDateRange(
            LocalDateTime from, LocalDateTime to, Pageable pageable) {
        return invoiceRepo.findByInvoiceDateBetweenOrderByInvoiceDateDesc(from, to, pageable)
                .map(DtoMapper::toResponse);
    }

    @Transactional
    public void deleteInvoice(Long id) {
        SalesInvoice inv = invoiceRepo.findById(id)
                .orElseThrow(() -> new EntityNotFoundException("Khong tim thay hoa don ID: " + id));
        for (SalesInvoiceItem item : inv.getItems()) {
            Product p = item.getProduct();
            p.setStockQty(p.getStockQty() + item.getQuantity());
            p.setUpdatedAt(LocalDateTime.now());
            productRepo.save(p);
            batchService.restoreStockOnCancel(p.getId(), item.getQuantity());
        }
        invoiceRepo.delete(inv);
    }
}
