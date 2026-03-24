package com.example.nhadanshop.service;

import com.example.nhadanshop.repository.InventoryReceiptRepository;
import com.example.nhadanshop.repository.SalesInvoiceRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.util.concurrent.atomic.AtomicInteger;

/**
 * Sinh số hóa đơn/phiếu nhập theo format: PREFIX-YYYYMMDD-XXXXX
 *
 * Khi ngày thay đổi hoặc server restart, sequence được seed lại từ DB
 * để tránh duplicate key (UNIQUE constraint violation).
 */
@Component
@RequiredArgsConstructor
public class InvoiceNumberGenerator {

    private static final DateTimeFormatter DATE_FMT = DateTimeFormatter.ofPattern("yyyyMMdd");

    private final InventoryReceiptRepository receiptRepository;
    private final SalesInvoiceRepository invoiceRepository;

    private final AtomicInteger invoiceSeq = new AtomicInteger(0);
    private final AtomicInteger receiptSeq = new AtomicInteger(0);
    private volatile String invoiceLastDate = "";
    private volatile String receiptLastDate = "";

    public synchronized String nextInvoiceNo() {
        String today = LocalDate.now().format(DATE_FMT);
        if (!today.equals(invoiceLastDate)) {
            invoiceLastDate = today;
            // Seed from DB: find max existing sequence for today
            String prefix = "INV-" + today + "-";
            int maxSeq = invoiceRepository.findMaxSeqForPrefix(prefix, prefix + "%");
            invoiceSeq.set(maxSeq);
        }
        return "INV-" + today + "-" + String.format("%05d", invoiceSeq.incrementAndGet());
    }

    public synchronized String nextReceiptNo() {
        String today = LocalDate.now().format(DATE_FMT);
        if (!today.equals(receiptLastDate)) {
            receiptLastDate = today;
            // Seed from DB: find max existing sequence for today
            String prefix = "RCP-" + today + "-";
            int maxSeq = receiptRepository.findMaxSeqForPrefix(prefix, prefix + "%");
            receiptSeq.set(maxSeq);
        }
        return "RCP-" + today + "-" + String.format("%05d", receiptSeq.incrementAndGet());
    }
}
