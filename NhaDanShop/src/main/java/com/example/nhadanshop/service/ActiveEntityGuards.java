package com.example.nhadanshop.service;

import com.example.nhadanshop.entity.Customer;
import com.example.nhadanshop.entity.Supplier;

import java.util.Objects;

/**
 * Enforces that archived (inactive) customers/suppliers are not bound to new transactions.
 * Historical reads and snapshot-only fields are unaffected.
 */
public final class ActiveEntityGuards {

    private ActiveEntityGuards() {
    }

    public static void requireActiveCustomerForBinding(Customer customer, Long idForMessage) {
        Objects.requireNonNull(customer, "customer");
        if (!Boolean.TRUE.equals(customer.getActive())) {
            throw new IllegalStateException(
                    "Khách hàng đã ngưng sử dụng — không thể gắn vào hóa đơn mới (ID: " + idForMessage + ")");
        }
    }

    public static void requireActiveSupplierForBinding(Supplier supplier, Long idForMessage) {
        Objects.requireNonNull(supplier, "supplier");
        if (!Boolean.TRUE.equals(supplier.getActive())) {
            throw new IllegalStateException(
                    "Nhà cung cấp đã ngưng sử dụng — không thể gắn vào phiếu nhập mới (ID: " + idForMessage + ")");
        }
    }
}
