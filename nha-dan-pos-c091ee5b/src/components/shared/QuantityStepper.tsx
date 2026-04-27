import { Minus, Plus } from "lucide-react";
import { cn } from "@/lib/utils";

interface QuantityStepperProps {
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  size?: 'sm' | 'md';
  className?: string;
}

export function QuantityStepper({ value, onChange, min = 1, max = 999, size = 'md', className }: QuantityStepperProps) {
  const btnClass = size === 'sm' ? 'h-6 w-6' : 'h-8 w-8';
  const iconSize = size === 'sm' ? 'h-3 w-3' : 'h-4 w-4';
  const inputClass = size === 'sm' ? 'w-8 text-xs h-6' : 'w-10 text-sm h-8';

  return (
    <div className={cn("flex items-center gap-0 border rounded-md overflow-hidden", className)}>
      <button
        onClick={() => onChange(Math.max(min, value - 1))}
        disabled={value <= min}
        className={cn("flex items-center justify-center bg-muted hover:bg-secondary transition-colors disabled:opacity-40", btnClass)}
      >
        <Minus className={iconSize} />
      </button>
      <input
        type="number"
        value={value}
        onChange={(e) => {
          const v = parseInt(e.target.value) || min;
          onChange(Math.min(max, Math.max(min, v)));
        }}
        className={cn("text-center border-x bg-card font-medium focus:outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none", inputClass)}
      />
      <button
        onClick={() => onChange(Math.min(max, value + 1))}
        disabled={value >= max}
        className={cn("flex items-center justify-center bg-muted hover:bg-secondary transition-colors disabled:opacity-40", btnClass)}
      >
        <Plus className={iconSize} />
      </button>
    </div>
  );
}
