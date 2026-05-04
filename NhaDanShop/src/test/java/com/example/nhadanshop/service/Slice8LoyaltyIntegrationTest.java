package com.example.nhadanshop.service;

import com.example.nhadanshop.dto.CustomerPointsSummaryResponse;
import com.example.nhadanshop.entity.*;
import com.example.nhadanshop.repository.*;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.data.domain.PageRequest;

import java.math.BigDecimal;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneId;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

@DataJpaTest(properties = {
        "spring.flyway.enabled=false",
        "spring.jpa.hibernate.ddl-auto=create-drop"
})
@Import({CustomerLoyaltyService.class, Slice8LoyaltyIntegrationTest.Cfg.class})
class Slice8LoyaltyIntegrationTest {
    @Autowired CustomerLoyaltyService loyaltyService;
    @Autowired CustomerRepository customerRepository;
    @Autowired CustomerPointTransactionRepository transactionRepository;
    @Autowired SalesInvoiceRepository invoiceRepository;
    @Autowired CategoryRepository categoryRepository;
    @Autowired ProductRepository productRepository;
    @Autowired ProductVariantRepository variantRepository;

    Customer customer;
    Product product;
    ProductVariant variant;

    @BeforeEach
    void setUp() {
        customer = new Customer();
        customer.setCode("KH-S8");
        customer.setName("Slice 8 Customer");
        customer = customerRepository.save(customer);

        Category category = new Category();
        category.setName("Slice8 Cat");
        category = categoryRepository.save(category);

        product = new Product();
        product.setCode("S8-P");
        product.setName("Slice 8 Product");
        product.setCategory(category);
        product = productRepository.save(product);

        variant = new ProductVariant();
        variant.setProduct(product);
        variant.setVariantCode("S8-V");
        variant.setVariantName("Default");
        variant.setSellUnit("cai");
        variant.setSellPrice(BigDecimal.valueOf(10000));
        variant.setCostPrice(BigDecimal.valueOf(5000));
        variant.setIsDefault(true);
        variant.setActive(true);
        variant.setIsSellable(true);
        variant = variantRepository.save(variant);
    }

    @Test
    void direct_invoice_earns_once_and_cancel_reverses_full_earn_without_lifetime_mutation() {
        SalesInvoice invoice = saveInvoice("INV-S8-EARN-1", billableItem(2, BigDecimal.valueOf(20000), null));

        loyaltyService.earnForInvoice(invoice);
        loyaltyService.earnForInvoice(invoice);
        Customer afterEarn = customerRepository.findById(customer.getId()).orElseThrow();
        assertThat(afterEarn.getPointBalance()).isEqualTo(20L);
        assertThat(afterEarn.getLifetimePointsEarned()).isEqualTo(20L);
        assertThat(transactionRepository.findByCustomerIdOrderByCreatedAtDesc(customer.getId(), PageRequest.of(0, 10)).getContent())
                .extracting(CustomerPointTransaction::getType)
                .containsExactly(CustomerPointTransaction.Type.EARN);

        invoice.setStatus(SalesInvoice.Status.CANCELLED);
        invoiceRepository.save(invoice);
        loyaltyService.reverseForInvoice(invoice, "cancelled");
        loyaltyService.reverseForInvoice(invoice, "cancelled again");

        Customer afterReverse = customerRepository.findById(customer.getId()).orElseThrow();
        assertThat(afterReverse.getPointBalance()).isZero();
        assertThat(afterReverse.getLifetimePointsEarned()).isEqualTo(20L);
        List<CustomerPointTransaction> txs = transactionRepository
                .findByCustomerIdOrderByCreatedAtDesc(customer.getId(), PageRequest.of(0, 10)).getContent();
        assertThat(txs).extracting(CustomerPointTransaction::getType)
                .containsExactly(CustomerPointTransaction.Type.ADJUST, CustomerPointTransaction.Type.EARN);
        assertThat(txs.get(0).getPointsDelta()).isEqualTo(-20L);
    }

    @Test
    void cancel_reverses_full_earn_points_allowing_negative_balance_future_earn_offsets() {
        SalesInvoice invoice = saveInvoice("INV-S8-SPEND", billableItem(2, BigDecimal.valueOf(20000), null));
        loyaltyService.earnForInvoice(invoice);
        Customer mid = customerRepository.findById(customer.getId()).orElseThrow();
        assertThat(mid.getPointBalance()).isEqualTo(20L);

        // Simulate unrelated point usage so remaining balance before cancel is lower than earned on this invoice.
        mid.setPointBalance(5L);
        customerRepository.save(mid);

        invoice.setStatus(SalesInvoice.Status.CANCELLED);
        invoiceRepository.save(invoice);
        loyaltyService.reverseForInvoice(invoice, "cancelled");
        loyaltyService.reverseForInvoice(invoice, "retry must not double reverse");

        Customer afterCancel = customerRepository.findById(customer.getId()).orElseThrow();
        assertThat(afterCancel.getPointBalance()).isEqualTo(-15L);

        List<CustomerPointTransaction> txs = transactionRepository
                .findByCustomerIdOrderByCreatedAtDesc(customer.getId(), PageRequest.of(0, 25)).getContent();
        List<CustomerPointTransaction.Type> types = txs.stream().map(CustomerPointTransaction::getType).toList();
        assertThat(types).filteredOn(t -> t == CustomerPointTransaction.Type.ADJUST).hasSize(1);
        assertThat(txs.stream().filter(t -> t.getType() == CustomerPointTransaction.Type.ADJUST))
                .allMatch(t -> t.getPointsDelta() == -20L);

        SalesInvoice invoice2 = saveInvoice("INV-S8-EARN-2", billableItem(3, BigDecimal.valueOf(30000), null));
        loyaltyService.earnForInvoice(invoice2);
        assertThat(customerRepository.findById(customer.getId()).orElseThrow().getPointBalance()).isEqualTo(15L);
    }

    @Test
    void summary_maps_negative_balance_to_zero_available_when_no_reservation() {
        Customer c = customerRepository.findById(customer.getId()).orElseThrow();
        c.setPointBalance(-33L);
        c.setPointReserved(0L);
        customerRepository.save(c);
        CustomerPointsSummaryResponse summary = loyaltyService.summary(c.getId());
        assertThat(summary.pointBalance()).isEqualTo(-33L);
        assertThat(summary.availablePoints()).isZero();
    }

    @Test
    void cancelling_invoice_with_no_earn_does_not_create_bogus_reversal() {
        SalesInvoice invoice = saveInvoice("INV-S8-NO-EARN", billableItem(1, BigDecimal.valueOf(500), null));
        invoice.setStatus(SalesInvoice.Status.CANCELLED);
        invoiceRepository.save(invoice);

        loyaltyService.reverseForInvoice(invoice, "cancelled");

        assertThat(transactionRepository.findByCustomerIdOrderByCreatedAtDesc(customer.getId(), PageRequest.of(0, 10)).getContent()).isEmpty();
    }

    @Test
    void earn_base_uses_net_item_revenue_and_excludes_reward_shipping_and_vat() {
        SalesInvoice invoice = saveInvoice("INV-S8-NET", billableItem(1, BigDecimal.valueOf(7000), null));
        invoice.setTotalAmount(BigDecimal.valueOf(57000)); // includes pretend shipping/VAT; earn must ignore invoice total.
        invoiceRepository.save(invoice);

        loyaltyService.earnForInvoice(invoice);

        Customer c = customerRepository.findById(customer.getId()).orElseThrow();
        assertThat(c.getPointBalance()).isEqualTo(7L);
    }

    @Test
    void legacy_fallback_subtracts_line_and_loyalty_discounts_and_reward_line_earns_zero() {
        SalesInvoice invoice = newInvoice("INV-S8-LEGACY");
        SalesInvoiceItem paid = billableItem(2, null, null);
        paid.setInvoice(invoice);
        paid.setOriginalUnitPrice(BigDecimal.valueOf(10000));
        paid.setUnitPrice(BigDecimal.valueOf(9000)); // own line discount = 2,000 total
        paid.setAllocatedLoyaltyDiscount(BigDecimal.valueOf(3000));
        invoice.getItems().add(paid);

        SalesInvoiceItem reward = billableItem(5, null, null);
        reward.setInvoice(invoice);
        reward.setRewardLine(true);
        reward.setOriginalUnitPrice(BigDecimal.valueOf(10000));
        reward.setUnitPrice(BigDecimal.ZERO);
        invoice.getItems().add(reward);
        invoice = invoiceRepository.save(invoice);

        loyaltyService.earnForInvoice(invoice);

        Customer c = customerRepository.findById(customer.getId()).orElseThrow();
        assertThat(c.getPointBalance()).isEqualTo(15L); // 20,000 gross - 2,000 own - 3,000 loyalty
    }

    private SalesInvoice saveInvoice(String invoiceNo, SalesInvoiceItem... items) {
        SalesInvoice invoice = newInvoice(invoiceNo);
        for (SalesInvoiceItem item : items) {
            item.setInvoice(invoice);
            invoice.getItems().add(item);
        }
        return invoiceRepository.save(invoice);
    }

    private SalesInvoice newInvoice(String invoiceNo) {
        SalesInvoice invoice = new SalesInvoice();
        invoice.setInvoiceNo(invoiceNo);
        invoice.setCustomer(customer);
        invoice.setCustomerName(customer.getName());
        invoice.setTotalAmount(BigDecimal.ZERO);
        invoice.setDiscountAmount(BigDecimal.ZERO);
        return invoice;
    }

    private SalesInvoiceItem billableItem(int qty, BigDecimal lineNetRevenue, BigDecimal allocatedMerchDiscount) {
        SalesInvoiceItem item = new SalesInvoiceItem();
        item.setProduct(product);
        item.setVariant(variant);
        item.setQuantity(qty);
        item.setOriginalUnitPrice(BigDecimal.valueOf(10000));
        item.setUnitPrice(BigDecimal.valueOf(10000));
        item.setUnitCostSnapshot(BigDecimal.valueOf(5000));
        item.setLineNetRevenue(lineNetRevenue);
        item.setAllocatedMerchandiseDiscount(allocatedMerchDiscount);
        item.setRewardLine(false);
        return item;
    }

    @TestConfiguration
    static class Cfg {
        @Bean Clock clock() { return Clock.fixed(Instant.parse("2026-04-30T00:00:00Z"), ZoneId.of("UTC")); }
    }
}

