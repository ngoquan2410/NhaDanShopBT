import { Link } from "react-router-dom";
import { AlertTriangle, X } from "lucide-react";
import { RECEIPT_BLOCK_DOWNSTREAM } from "@/lib/receiptUiState";

interface Props {
  open: boolean;
  onClose: () => void;
  receiptNumber?: string;
  /**
   * When not {@link RECEIPT_BLOCK_DOWNSTREAM}, downstream-specific copy is omitted
   * (defensive — parent should only open this dialog for downstream blocks).
   */
  deleteBlockReason?: string | null;
  /** Optional: open void confirmation flow if available on the page. */
  onVoid?: () => void;
  /** Optional: scroll/open batch detail section if available. */
  onViewBatches?: () => void;
}

/**
 * UI shell shown when goods receipt cannot be deleted because its batch
 * has downstream consumption (canDelete=false / 409 downstream_consumption).
 *
 * UI-only — does NOT change delete/void backend behavior. Delete remains
 * blocked. This panel only explains the lifecycle and surfaces safe next-step
 * actions that already exist (Void, Stock Adjustment).
 */
export function ReceiptDeleteBlockedDialog({
  open,
  onClose,
  receiptNumber,
  deleteBlockReason,
  onVoid,
  onViewBatches,
}: Props) {
  if (!open) return null;

  const isDownstream = deleteBlockReason === RECEIPT_BLOCK_DOWNSTREAM;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      data-testid="receipt-delete-blocked-dialog"
    >
      <div className="fixed inset-0 bg-foreground/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-lg rounded-xl border border-yellow-200 bg-yellow-50 text-yellow-900 shadow-xl">
        <button
          type="button"
          onClick={onClose}
          className="absolute right-3 top-3 p-1 rounded hover:bg-yellow-100 text-yellow-700"
          aria-label="Đóng"
        >
          <X className="h-4 w-4" />
        </button>

        <div className="p-5">
          <div className="flex items-start gap-3">
            <div className="rounded-full bg-yellow-100 p-2">
              <AlertTriangle className="h-5 w-5 text-yellow-700" />
            </div>
            <div className="flex-1">
              <h3 className="text-base font-semibold">
                Không thể xóa phiếu nhập{receiptNumber ? ` ${receiptNumber}` : ""}
              </h3>
              {isDownstream ? (
                <>
                  <p
                    className="mt-2 text-sm leading-relaxed"
                    data-testid="receipt-delete-blocked-downstream-lead"
                  >
                    Phiếu nhập/lô đã phát sinh bán hàng nên không thể xóa.
                  </p>
                  <p className="mt-1 text-sm leading-relaxed">Bạn có thể:</p>
                  <ol
                    className="mt-2 ml-4 list-decimal text-sm space-y-1 leading-relaxed"
                    data-testid="receipt-delete-blocked-downstream-options"
                  >
                    <li>Void phần tồn còn lại của phiếu nếu muốn hủy hiệu lực phiếu nhập.</li>
                    <li>Tạo phiếu điều chỉnh tồn kho để giảm/tăng đúng số lượng thực tế.</li>
                    <li>Xem các batch đã phát sinh bán hàng.</li>
                  </ol>
                </>
              ) : (
                <p className="mt-2 text-sm leading-relaxed">
                  Không thể xóa phiếu nhập này. Vui lòng kiểm tra trạng thái phiếu hoặc liên hệ quản trị.
                </p>
              )}
            </div>
          </div>

          <div className="mt-5 flex flex-wrap gap-2 justify-end">
            {isDownstream && onViewBatches && (
              <button
                type="button"
                data-testid="receipt-delete-blocked-view-batches"
                onClick={() => {
                  onViewBatches();
                  onClose();
                }}
                className="px-3 py-1.5 text-xs font-medium border border-yellow-300 bg-white rounded-md hover:bg-yellow-100 text-yellow-900"
              >
                Xem batch
              </button>
            )}
            {isDownstream && (
              <Link
                to="/admin/stock-adjustments/create"
                onClick={onClose}
                className="px-3 py-1.5 text-xs font-medium border border-yellow-300 bg-white rounded-md hover:bg-yellow-100 text-yellow-900"
                data-testid="receipt-delete-blocked-adjustment-link"
              >
                Tạo phiếu điều chỉnh tồn
              </Link>
            )}
            {isDownstream && onVoid && (
              <button
                type="button"
                data-testid="receipt-delete-blocked-void-remaining"
                onClick={() => {
                  onVoid();
                  onClose();
                }}
                className="px-3 py-1.5 text-xs font-medium bg-yellow-600 text-white rounded-md hover:bg-yellow-700"
              >
                Void phần tồn còn lại
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 text-xs font-medium text-yellow-900 hover:bg-yellow-100 rounded-md"
            >
              Đóng
            </button>
          </div>

          {isDownstream && (
            <p className="mt-3 text-[11px] text-yellow-800/80 italic" data-testid="receipt-delete-blocked-void-footnote">
              Void không phải xóa. Void chỉ hủy hiệu lực phần tồn còn lại và vẫn giữ lịch sử phân bổ hóa đơn /
              phiếu nhập.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
