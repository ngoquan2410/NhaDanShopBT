import type { GoodsReceipt, GoodsReceiptLine } from "@/services/types";
import { PrintableThermalReceipt } from "@/components/shared/PrintableThermalReceipt";

interface Props {
  receipt: GoodsReceipt;
  lines: GoodsReceiptLine[];
  rootId?: string;
}

export function Printable58Receipt({ receipt, lines, rootId }: Props) {
  return <PrintableThermalReceipt receipt={receipt} lines={lines} paper="pos58" rootId={rootId} />;
}
