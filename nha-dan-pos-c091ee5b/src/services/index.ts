// Composition root.
// To swap to EC2 backend later: replace the right-hand side of each export only.
// UI MUST import services from this file (or "@/services/types") — never from adapters directly.

import type { StoreSettingsService } from "./storeSettings/StoreSettingsService";
import type { VietQrService } from "./vietQr/VietQrService";
import type { AddressService } from "./addresses/AddressService";
import type { ShippingService } from "./shipping/ShippingService";
import type { PendingOrderService } from "./pendingOrders/PendingOrderService";
import type { PromotionEvaluationService } from "./promotions/PromotionEvaluationService";
import type { CustomerService } from "./customers/CustomerService";
import type { VoucherService } from "./vouchers/VoucherService";
import type { InvoiceService } from "./invoices/InvoiceService";
import type { PaymentEventService } from "./paymentEvents/PaymentEventService";
import type { ProductService } from "./products/ProductService";
import type { InventoryService } from "./inventory/InventoryService";
import type { GoodsReceiptService } from "./goodsReceipts/GoodsReceiptService";
import type { PromotionCrudService } from "./promotionsCrud/PromotionCrudService";
import type { PaymentService } from "./payments/PaymentService";
import type { CategoryService } from "./categories/CategoryService";

import { BackendStoreSettingsAdapter } from "./adapters/backend/BackendStoreSettingsAdapter";
import { BackendVietQrAdapter } from "./adapters/backend/BackendVietQrAdapter";
import { BackendPaymentEventAdapter } from "./adapters/backend/BackendPaymentEventAdapter";
import { LocalAddressAdapter } from "./adapters/local/LocalAddressAdapter";
import { RemoteAddressAdapter } from "./adapters/remote/RemoteAddressAdapter";
import { HybridAddressAdapter } from "./adapters/remote/HybridAddressAdapter";
import { LocalShippingAdapter } from "./adapters/local/LocalShippingAdapter";
import { GhnShippingAdapter } from "./adapters/remote/GhnShippingAdapter";
import { HybridShippingAdapter } from "./adapters/remote/HybridShippingAdapter";
import { CloudPendingOrderAdapter } from "./adapters/cloud/CloudPendingOrderAdapter";
import { LocalPromotionAdapter } from "./adapters/local/LocalPromotionAdapter";
import { LocalCustomerAdapter } from "./adapters/local/LocalCustomerAdapter";
import { LocalVoucherAdapter } from "./adapters/local/LocalVoucherAdapter";
import { LocalInvoiceAdapter } from "./adapters/local/LocalInvoiceAdapter";
import { HybridProductAdapter } from "./adapters/HybridProductAdapter";
import { HybridCategoryAdapter } from "./adapters/HybridCategoryAdapter";
import { LocalInventoryAdapter } from "./adapters/local/LocalInventoryAdapter";
import { HybridInventoryAdapter } from "./adapters/HybridInventoryAdapter";
import { LocalGoodsReceiptAdapter } from "./adapters/local/LocalGoodsReceiptAdapter";
import { HybridGoodsReceiptAdapter } from "./adapters/HybridGoodsReceiptAdapter";
import { LocalPromotionCrudAdapter } from "./adapters/local/LocalPromotionCrudAdapter";
import { LocalPaymentAdapter } from "./adapters/local/LocalPaymentAdapter";

export const storeSettings: StoreSettingsService = new BackendStoreSettingsAdapter();
export const vietQr: VietQrService = new BackendVietQrAdapter();
export const addresses: AddressService = new HybridAddressAdapter(
  new RemoteAddressAdapter(),
  new LocalAddressAdapter(),
);
export const shipping: ShippingService = new HybridShippingAdapter(
  new GhnShippingAdapter(storeSettings),
  new LocalShippingAdapter(),
);
export const pendingOrders: PendingOrderService = new CloudPendingOrderAdapter();
export const promotions: PromotionEvaluationService = new LocalPromotionAdapter();
export const customers: CustomerService = new LocalCustomerAdapter();
export const vouchers: VoucherService = new LocalVoucherAdapter();
export const invoices: InvoiceService = new LocalInvoiceAdapter();
export const paymentEvents: PaymentEventService = new BackendPaymentEventAdapter();
export const products: ProductService = new HybridProductAdapter();
export const inventory: InventoryService = new HybridInventoryAdapter();
export const goodsReceipts: GoodsReceiptService = new HybridGoodsReceiptAdapter();
export const promotionsCrud: PromotionCrudService = new LocalPromotionCrudAdapter();
export const payments: PaymentService = new LocalPaymentAdapter();
export const categories: CategoryService = new HybridCategoryAdapter();

// Re-export interface types for UI consumers that need to type service references.
export type { StoreSettingsService } from "./storeSettings/StoreSettingsService";
export type { VietQrService } from "./vietQr/VietQrService";
export type { AddressService } from "./addresses/AddressService";
export type { ShippingService } from "./shipping/ShippingService";
export type { PendingOrderService } from "./pendingOrders/PendingOrderService";
export type { PromotionEvaluationService } from "./promotions/PromotionEvaluationService";
export type { CustomerService } from "./customers/CustomerService";
export type { VoucherService } from "./vouchers/VoucherService";
export type { InvoiceService, CreateInvoiceInput, InvoiceListParams } from "./invoices/InvoiceService";
export type { PaymentEventService, PaymentEvent } from "./paymentEvents/PaymentEventService";
export type { ProductService, ProductListParams } from "./products/ProductService";
export type { InventoryService } from "./inventory/InventoryService";
export { normalizeInvoiceLineAllocationsFromApi } from "./invoices/invoiceLineAllocations";
export type { InventoryProjectionBatch } from "./types";
export type {
  GoodsReceiptService,
  GoodsReceiptListParams,
  CreateGoodsReceiptInput,
} from "./goodsReceipts/GoodsReceiptService";
export type {
  PromotionCrudService,
  PromotionListParams,
} from "./promotionsCrud/PromotionCrudService";
export type {
  PaymentService,
  PaymentSession,
  PaymentSessionStatus,
  CreatePaymentSessionInput,
} from "./payments/PaymentService";
export type {
  CategoryService,
  CategoryListParams,
  CreateCategoryInput,
} from "./categories/CategoryService";
