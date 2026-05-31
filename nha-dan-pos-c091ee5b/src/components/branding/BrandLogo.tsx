import { cn } from "@/lib/utils";

type BrandLogoVariant = "horizontal" | "compact" | "badge" | "mark";

interface BrandLogoProps {
  variant?: BrandLogoVariant;
  className?: string;
}

const logoSrcByVariant: Record<BrandLogoVariant, string> = {
  horizontal: "/brand/nha-dan-logo-horizontal.svg",
  compact: "/brand/nha-dan-logo-compact.svg",
  badge: "/brand/nha-dan-logo-badge.svg",
  mark: "/brand/nha-dan-logo-mark.svg",
};

export function BrandLogo({ variant = "horizontal", className }: BrandLogoProps) {
  return (
    <img
      src={logoSrcByVariant[variant]}
      alt="Nhã Đan Shop"
      title="Nhã Đan Shop"
      draggable={false}
      className={cn("block h-auto w-auto object-contain", className)}
    />
  );
}
