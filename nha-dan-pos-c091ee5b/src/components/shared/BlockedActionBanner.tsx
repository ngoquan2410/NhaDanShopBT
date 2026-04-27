import { ShieldAlert } from "lucide-react";
import { cn } from "@/lib/utils";

interface BlockedActionBannerProps {
  message: string;
  className?: string;
}

export function BlockedActionBanner({ message, className }: BlockedActionBannerProps) {
  return (
    <div className={cn("flex items-center gap-2 p-2 bg-muted rounded-md text-xs text-muted-foreground", className)}>
      <ShieldAlert className="h-3.5 w-3.5 shrink-0" />
      <span>{message}</span>
    </div>
  );
}
