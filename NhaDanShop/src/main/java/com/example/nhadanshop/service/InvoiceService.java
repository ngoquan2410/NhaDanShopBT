package com.example.nhadanshop.service;

import com.example.nhadanshop.dto.InvoiceItemRequest;
import com.example.nhadanshop.dto.SalesInvoiceRequest;
import com.example.nhadanshop.dto.SalesInvoiceResponse;
import com.example.nhadanshop.entity.Product;
import com.example.nhadanshop.entity.SalesInvoice;
import com.example.nhadanshop.entity.SalesInvoiceItem;
import com.example.nhadanshop.repository.ProductRepository;
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
                            "Không tìm thấy sản phẩm ID: " + itemReq.productId()));

            if (!product.getActive()) {
                throw new IllegalArgumentException(
                        "Sản phẩm '" + product.getName() + "' đã ngừng kinh doanh");
            }
            if (product.getStockQty() < itemReq.quantity()) {
                throw new IllegalArgumentException(
                        "Sản phẩm '" + product.getName() + "' không đủ hàng. " +
                        "Tồn kho: " + product.getStockQty() + ", yêu cầu: " + itemReq.quantity());
            }

            // [ATOMIC] Tính weighted avg cost VÀ trừ lô hàng FEFO trong 1 transaction
            // với PESSIMISTIC WRITE LOCK → tránh race condition khi nhiều request đồng thời
            // costSnapshot luôn khớp chính xác với lô thực tế bị deduct
            BigDecimal fefoAvgCost = batchService.deductStockFEFOAndComputeCost(
                    product.getId(), itemReq.quantity());

            // Trừ tồn kho tổng trên product
            product.setStockQty(product.getStockQty() - itemReq.quantity());
            product.setUpdatedAt(LocalDateTime.now());
            productRepo.save(product);


            SalesInvoiceItem item = new SalesInvoiceItem();
            item.setInvoice(invoice);
            item.setProduct(product);
            item.setQuantity(itemReq.quantity());
            item.setUnitPrice(product.getSellPrice());
            // Dùng giá vốn bình quân FEFO thay vì product.getCostPrice()
            // → đảm bảo lợi nhuận tính đúng theo từng lô
            item.setUnitCostSnapshot(fefoAvgCost.compareTo(BigDecimal.ZERO) > 0
                    ? fefoAvgCost : product.getCostPrice());

            totalAmount = totalAmount.add(
                    product.getSellPrice().multiply(BigDecimal.valueOf(itemReq.quantity())));
            items.add(item);
        }

        invoice.setTotalAmount(totalAmount);
        invoice.getItems().addAll(items);

        SalesInvoice saved = invoiceRepo.save(invoice);
        return DtoMapper.toResponse(saved);
    }

    public SalesInvoiceResponse getInvoice(Long id) {
        SalesInvoice inv = invoiceRepo.findById(id)
                .orElseThrow(() -> new EntityNotFoundException("Không tìm thấy hóa đơn ID: " + id));
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
                .orElseThrow(() -> new EntityNotFoundException("Không tìm thấy hóa đơn ID: " + id));

        for (SalesInvoiceItem item : inv.getItems()) {
            Product p = item.getProduct();
            // Hoàn tồn kho tổng
            p.setStockQty(p.getStockQty() + item.getQuantity());
            p.setUpdatedAt(LocalDateTime.now());
            productRepo.save(p);
            // Hoàn lại lô hàng
            batchService.restoreStockOnCancel(p.getId(), item.getQuantity());
        }
        invoiceRepo.delete(inv);
    }
}

