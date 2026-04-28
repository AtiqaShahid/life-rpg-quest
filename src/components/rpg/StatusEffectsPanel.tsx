import { usePlayer, type StatusEffectKind } from "@/hooks/usePlayer";
import { AlertTriangle, Zap, Wind, Shield } from "lucide-react";
import { cn } from "@/lib/utils";

const META: Record<StatusEffectKind, { label: string; icon: React.ComponentType<{ className?: string }>; cls: string }> = {
  burnout:    { label: "Burnout",    icon: AlertTriangle, cls: "border-destructive/40 text-destructive" },
  flow_state: { label: "Flow State", icon: Zap,           cls: "border-secondary/40 text-secondary shadow-glow-secondary" },
  fatigue:    { label: "Fatigue",    icon: Wind,          cls: "border-amber-400/40 text-amber-400" },
};

export const StatusEffectsPanel = () => {
  const { statusEffects, profile, classCatalog } = usePlayer();
  const econ = profile as unknown as { class_type: string | null } | null;
  const cls = classCatalog.find((c) => c.id === econ?.class_type);

  if (!cls && (!statusEffects || statusEffects.length === 0)) return null;

  return (
    <div className="glass rounded-2xl border border-border/50 p-4">
      <div className="mb-3 flex items-center gap-2">
        <Shield className="h-4 w-4 text-secondary" />
        <h3 className="font-display text-sm font-semibold tracking-tight">Identity & Status</h3>
      </div>
      <div className="flex flex-wrap gap-2">
        {cls && (
          <div className="glass flex items-center gap-2 rounded-xl border border-primary/30 px-3 py-2 text-xs">
            <span className="text-base leading-none">{cls.icon}</span>
            <div>
              <div className="font-display text-sm font-bold">{cls.name}</div>
              <div className="font-mono text-[10px] text-muted-foreground">{cls.tagline}</div>
            </div>
          </div>
        )}
        {statusEffects?.map((s) => {
          const m = META[s.kind];
          const Icon = m.icon;
          const hours = Math.max(0, Math.round((new Date(s.expires_at).getTime() - Date.now()) / 3600_000));
          return (
            <div key={s.id} className={cn("glass flex max-w-[260px] items-start gap-2 rounded-xl border px-3 py-2 text-xs", m.cls)}>
              <Icon className="mt-0.5 h-4 w-4 shrink-0" />
              <div className="min-w-0">
                <div className="flex items-center gap-2 font-display text-sm font-bold">
                  {m.label}
                  <span className="font-mono text-[10px] text-muted-foreground">{hours}h</span>
                </div>
                <p className="line-clamp-2 text-muted-foreground">{s.reason}</p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};