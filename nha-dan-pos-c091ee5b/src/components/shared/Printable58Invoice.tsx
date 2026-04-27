import type { Invoice, InvoiceLine } from "@/lib/mock-data";
import { PrintableThermalInvoice } from "@/components/shared/PrintableThermalInvoice";

interface Props {
  invoice: Invoice;
  lines: InvoiceLine[];
  rootId?: string;
}

export function Printable58Invoice({ invoice, lines, rootId }: Props) {
  return <PrintableThermalInvoice invoice={invoice} lines={lines} paper="pos58" rootId={rootId} />;
}
