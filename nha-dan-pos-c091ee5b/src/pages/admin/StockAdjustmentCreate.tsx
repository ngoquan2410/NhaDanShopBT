import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { PageHeader } from "@/components/shared/PageHeader";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { mockAdjustmentLines } from "@/lib/mock-data";
import {
  ArrowLeft, Save, Check, Trash2, Search, Plus, AlertTriangle, FileText
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

export default function AdminStockAdjustmentCreate() {
  const navigate = useNavigate();
  const [status, setStatus] = useState<'draft' | 'confirmed'>('draft');
  const [lines, setLines] = useState(mockAdjustmentLines);
  const [reason, setReason] = useState('Kiểm kho định kỳ');
  const [note, setNote] = useState('Kiểm kho tháng 4/2025');
  const [search, setSearch] = useState('');
  const [showConfirm, setShowConfirm] = useState(false);
  const [showDelete, setShowDelete] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);

  const handleSaveDraft = () => {
    if (lines.length === 0) {
      toast.error("Chưa có mặt hàng nào để lưu nháp");
      return;
    }
    setSavedAt(new Date().toISOString());
    toast.success("Đã lưu nháp phiếu điều chỉnh");
  };

  const handleConfirm = () => {
    setStatus('confirmed');
    toast.success("Đã xác nhận phiếu — tồn kho đã được cập nhật");
  };

  const handleDelete = () => {
    toast.success("Đã xóa phiếu nháp");
    navigate('/admin/stock-adjustments');
  };

  const addLine = () => {
    if (!search.trim()) return;
    setLines(prev => [...prev, {
      id: `m-${Date.now()}`,
      variantCode: search.toUpperCase(),
      productName: search,
      variantName: 'Mặc định',
      systemQty: 0,
      actualQty: 0,
      difference: 0,
      note: '',
    }]);
    setSearch('');
    toast.success(`Đã thêm "${search}" vào phiếu`);
  };

  const totalPositive = lines.filter(l => l.difference > 0).reduce((s, l) => s + l.difference, 0);
  const totalNegative = lines.filter(l => l.difference < 0).reduce((s, l) => s + l.difference, 0);

  return (
    <div className="admin-dense">
      <div className="flex items-center gap-2 text-sm text-muted-foreground mb-3">
        <Link to="/admin/stock-adjustments" className="flex items-center gap-1 hover:text-foreground"><ArrowLeft className="h-3.5 w-3.5" /> Kiểm kho</Link>
        <span>/</span><span className="text-foreground font-medium">{status === 'draft' ? 'Phiếu nháp' : 'Phiếu đã xác nhận'}</span>
      </div>

      <PageHeader
        title={status === 'draft' ? 'Phiếu điều chỉnh (Nháp)' : 'Phiếu điều chỉnh (Đã xác nhận)'}
        actions={
          <div className="flex items-center gap-2">
            <StatusBadge status={status === 'draft' ? 'draft' : 'confirmed'} size="md" />
            {status === 'draft' && (
              <>
                <button onClick={() => setShowDelete(true)} className="px-3 py-1.5 text-xs font-medium border border-danger text-danger rounded-md hover:bg-danger-soft">
                  <Trash2 className="h-3.5 w-3.5 inline mr-1" /> Xóa nháp
                </button>
                <button onClick={handleSaveDraft} className="px-3 py-1.5 text-xs font-medium border rounded-md hover:bg-muted">
                  <FileText className="h-3.5 w-3.5 inline mr-1" /> Lưu nháp
                </button>
                <button onClick={() => setShowConfirm(true)} className="px-3 py-1.5 text-xs font-medium bg-success text-success-foreground rounded-md hover:bg-success/90">
                  <Check className="h-3.5 w-3.5 inline mr-1" /> Xác nhận
                </button>
              </>
            )}
          </div>
        }
      />

      {/* Status banner */}
      {status === 'draft' && (
        <div className="flex items-center gap-2 p-3 bg-info-soft rounded-lg border border-info/20 text-sm text-info mt-3">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span>Phiếu đang ở trạng thái <strong>NHÁP</strong>. Tồn kho chỉ thay đổi sau khi xác nhận.</span>
        </div>
      )}
      {status === 'confirmed' && (
        <div className="flex items-center gap-2 p-3 bg-success-soft rounded-lg border border-success/20 text-sm text-success mt-3">
          <Check className="h-4 w-4 shrink-0" />
          <span>Phiếu đã được xác nhận. Tồn kho đã được cập nhật.</span>
        </div>
      )}

      {/* Metadata */}
      <div className="bg-card rounded-lg border p-4 mt-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="text-xs font-medium text-muted-foreground">Lý do</label>
            <select value={reason} onChange={e => setReason(e.target.value)} disabled={status === 'confirmed'} className="mt-1 w-full h-8 px-2 text-sm border rounded-md bg-background disabled:opacity-60">
              <option>Kiểm kho định kỳ</option>
              <option>Hàng hỏng</option>
              <option>Sai lệch hệ thống</option>
              <option>Khác</option>
            </select>
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground">Ghi chú</label>
            <input value={note} onChange={e => setNote(e.target.value)} disabled={status === 'confirmed'} className="mt-1 w-full h-8 px-3 text-sm border rounded-md bg-background disabled:opacity-60" />
          </div>
        </div>
      </div>

      {/* Add line */}
      {status === 'draft' && (
        <div className="flex items-center gap-2 mt-3">
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && addLine()}
              placeholder="Tìm phân loại / mã vạch để thêm... (Enter)"
              className="w-full h-8 pl-9 pr-3 text-sm bg-card border rounded-md focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </div>
          <button onClick={addLine} disabled={!search.trim()} className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium border rounded-md hover:bg-muted disabled:opacity-50">
            <Plus className="h-3.5 w-3.5" /> Thêm
          </button>
        </div>
      )}

      {savedAt && status === 'draft' && (
        <div className="mt-2 text-xs text-muted-foreground">Đã lưu nháp lúc {new Date(savedAt).toLocaleTimeString('vi-VN')}</div>
      )}

      {/* Summary strip */}
      <div className="grid grid-cols-3 gap-3 mt-3">
        <div className="bg-card rounded-lg border p-3 text-center">
          <p className="text-xs text-muted-foreground">Mặt hàng</p>
          <p className="text-lg font-bold">{lines.length}</p>
        </div>
        <div className="bg-success-soft rounded-lg border border-success/20 p-3 text-center">
          <p className="text-xs text-success">Tăng</p>
          <p className="text-lg font-bold text-success">+{totalPositive}</p>
        </div>
        <div className="bg-danger-soft rounded-lg border border-danger/20 p-3 text-center">
          <p className="text-xs text-danger">Giảm</p>
          <p className="text-lg font-bold text-danger">{totalNegative}</p>
        </div>
      </div>

      {/* Lines */}
      <div className="bg-card rounded-lg border overflow-x-auto mt-3">
        <table className="w-full text-sm min-w-[600px]">
          <thead>
            <tr className="border-b bg-muted/50">
              <th className="text-left px-3 py-2 font-medium text-muted-foreground">Phân loại</th>
              <th className="text-center px-3 py-2 font-medium text-muted-foreground">Hệ thống</th>
              <th className="text-center px-3 py-2 font-medium text-muted-foreground">Thực tế</th>
              <th className="text-center px-3 py-2 font-medium text-muted-foreground">Chênh lệch</th>
              <th className="text-left px-3 py-2 font-medium text-muted-foreground">Ghi chú</th>
              {status === 'draft' && <th className="w-8" />}
            </tr>
          </thead>
          <tbody>
            {lines.map(l => (
              <tr key={l.id} className={cn("border-b last:border-0 hover:bg-muted/30", l.difference !== 0 && (l.difference > 0 ? "bg-success-soft/30" : "bg-danger-soft/30"))}>
                <td className="px-3 py-2.5">
                  <p className="font-medium text-xs">{l.productName}</p>
                  <p className="text-[11px] text-muted-foreground">{l.variantName} · {l.variantCode}</p>
                </td>
                <td className="px-3 py-2.5 text-center font-medium">{l.systemQty}</td>
                <td className="px-3 py-2.5 text-center">
                  {status === 'draft' ? (
                    <input type="number" value={l.actualQty} onChange={e => setLines(prev => prev.map(x => x.id === l.id ? { ...x, actualQty: +e.target.value, difference: +e.target.value - x.systemQty } : x))} className="w-16 h-7 text-center text-xs border rounded bg-background" />
                  ) : (
                    <span className="font-medium">{l.actualQty}</span>
                  )}
                </td>
                <td className="px-3 py-2.5 text-center">
                  <span className={cn("font-bold text-sm", l.difference > 0 ? "text-success" : l.difference < 0 ? "text-danger" : "text-muted-foreground")}>
                    {l.difference > 0 ? `+${l.difference}` : l.difference}
                  </span>
                </td>
                <td className="px-3 py-2.5">
                  {status === 'draft' ? (
                    <input value={l.note} onChange={e => setLines(prev => prev.map(x => x.id === l.id ? { ...x, note: e.target.value } : x))} className="w-full h-7 text-xs border rounded bg-background px-2" />
                  ) : (
                    <span className="text-xs text-muted-foreground">{l.note}</span>
                  )}
                </td>
                {status === 'draft' && (
                  <td className="px-3 py-2.5">
                    <button onClick={() => setLines(prev => prev.filter(x => x.id !== l.id))} className="p-0.5 text-muted-foreground hover:text-danger"><Trash2 className="h-3.5 w-3.5" /></button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile sticky actions */}
      {status === 'draft' && (
        <div className="fixed bottom-0 left-0 right-0 p-3 bg-card border-t lg:hidden z-30 flex gap-2">
          <button onClick={handleSaveDraft} className="flex-1 py-2 text-sm font-medium border rounded-md hover:bg-muted">Lưu nháp</button>
          <button onClick={() => setShowConfirm(true)} className="flex-1 py-2 text-sm font-semibold bg-success text-success-foreground rounded-md">Xác nhận</button>
        </div>
      )}

      <ConfirmDialog open={showConfirm} onClose={() => setShowConfirm(false)} onConfirm={handleConfirm} title="Xác nhận phiếu điều chỉnh?" description="Sau khi xác nhận, tồn kho sẽ được cập nhật và không thể hoàn tác. Hãy kiểm tra lại trước khi xác nhận." confirmLabel="Xác nhận điều chỉnh" variant="warning" />
      <ConfirmDialog open={showDelete} onClose={() => setShowDelete(false)} onConfirm={handleDelete} title="Xóa phiếu nháp?" description="Phiếu nháp này sẽ bị xóa vĩnh viễn." confirmLabel="Xóa" variant="danger" />
    </div>
  );
}
