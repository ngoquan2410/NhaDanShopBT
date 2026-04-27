import { useRef, useState } from "react";
import { FileSpreadsheet, Loader2, Upload, X } from "lucide-react";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";
import { importStaging } from "@/lib/import-staging";
import { parseProductExcel } from "@/lib/excel-parser";

interface Props {
  open: boolean;
  onClose: () => void;
}

export function ImportPreviewDialog({ open, onClose }: Props) {
  const navigate = useNavigate();
  const fileRef = useRef<HTMLInputElement>(null);
  const [parsing, setParsing] = useState(false);

  if (!open) return null;

  const handleClose = () => {
    if (!parsing) onClose();
  };

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      setParsing(true);
      const rows = await parseProductExcel(file);
      if (rows.length === 0) {
        toast.error("Không đọc được dữ liệu từ template sản phẩm.");
        return;
      }
      importStaging.setProducts({ filename: file.name, rows, createdAt: Date.now() });
      const errors = rows.filter((row) => row.status === "error").length;
      const warnings = rows.filter((row) => row.status === "warning").length;
      toast.success(`Đã đọc ${rows.length} dòng · ${errors} lỗi · ${warnings} cảnh báo. Chuyển sang màn review.`);
      onClose();
      navigate("/admin/products/new?mode=import");
    } catch (error) {
      console.error(error);
      toast.error("Không thể parse file sản phẩm. Hãy dùng đúng template .xlsx.");
    } finally {
      setParsing(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-foreground/30 backdrop-blur-sm" onClick={handleClose} />
      <div className="relative w-full max-w-xl rounded-lg border bg-card shadow-xl animate-scale-in">
        <div className="flex items-center justify-between border-b px-5 py-3">
          <div className="flex items-center gap-2">
            <FileSpreadsheet className="h-5 w-5 text-primary" />
            <h3 className="font-semibold">Nhập Excel sản phẩm</h3>
          </div>
          <button onClick={handleClose} disabled={parsing} className="text-muted-foreground hover:text-foreground disabled:opacity-50">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-4 p-5">
          <div className="rounded-lg border border-dashed p-6 text-center">
            <div className="mb-3 inline-flex rounded-full bg-muted p-3">
              <Upload className="h-6 w-6 text-muted-foreground" />
            </div>
            <h4 className="font-semibold">Chọn đúng template “Copy of template_import_san_pham (5).xlsx”</h4>
            <p className="mt-1 text-sm text-muted-foreground">
              Modal này chỉ chọn file và parse. Màn hình <strong>/admin/products/new</strong> sẽ là nơi duy nhất để review, sửa lỗi và lưu.
            </p>
            <input ref={fileRef} type="file" accept=".xlsx,.xls" onChange={handleFileChange} className="hidden" />
            <button
              onClick={() => fileRef.current?.click()}
              disabled={parsing}
              className="mt-4 inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-60"
            >
              {parsing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
              {parsing ? "Đang parse file..." : "Chọn file Excel"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
