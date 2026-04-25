import { cn } from "@/lib/utils";

export const XpBar = ({ value, max, className, showLabel = true }: { value: number; max: number; className?: string; showLabel?: boolean }) => {
  const pct = Math.min(100, Math.max(0, (value / max) * 100));
  return (
    <div className={cn("w-full", className)}>
      <div className="relative h-3 w-full overflow-hidden rounded-full bg-muted/60 ring-1 ring-inset ring-primary/20">
        <div
          className="xp-bar-fill absolute inset-y-0 left-0 rounded-full transition-all duration-700 ease-out"
          style={{ width: `${pct}%` }}
        />
        <div className="absolute inset-0 rounded-full ring-1 ring-inset ring-white/10" />
      </div>
      {showLabel && (
        <div className="mt-1.5 flex justify-between font-mono text-[11px] tracking-wider text-muted-foreground">
          <span>XP {value.toLocaleString()} / {max.toLocaleString()}</span>
          <span className="text-secondary">{pct.toFixed(0)}%</span>
        </div>
      )}
    </div>
  );
};
