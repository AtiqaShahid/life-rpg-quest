import { useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { Zap, Loader2 } from "lucide-react";
import { usePlayer, type ActivityType } from "@/hooks/usePlayer";
import { LogActivityDialog } from "./LogActivityDialog";
import { xpToNext } from "@/lib/progression";

/**
 * Fixed-bottom action bar — always visible "Earn XP" CTA.
 * On mobile it sits above the bottom nav (which is ~64px tall).
 */
export const EarnXpBar = () => {
  const p = usePlayer();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [openType, setOpenType] = useState<ActivityType | null>(null);

  const onActivities = pathname.startsWith("/app/activities");

  const handleClick = () => {
    if (p.loading) return;
    if (onActivities) {
      // Quick-pick the first activity type as a one-tap log.
      const first = p.activityTypes[0];
      if (first) setOpenType(first);
      return;
    }
    navigate("/app/activities");
  };

  const next = p.profile ? xpToNext(p.profile.level) : 0;
  const pct = p.profile && next > 0 ? Math.min(100, Math.round((p.profile.xp / next) * 100)) : 0;

  return (
    <>
      <div
        className="fixed inset-x-0 bottom-0 z-40 border-t border-border/50 bg-background/85 backdrop-blur-xl md:left-64"
        style={{ paddingBottom: "max(env(safe-area-inset-bottom), 0px)" }}
      >
        {/* Mobile reserves room for the bottom nav (~64px) */}
        <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-3 pb-[76px] sm:px-6 md:px-8 md:pb-3">
          <div className="hidden flex-1 sm:block">
            <div className="flex items-center justify-between font-mono text-[10px] tracking-widest text-muted-foreground">
              <span>LV {p.profile?.level ?? "—"}</span>
              <span>{p.profile ? `${p.profile.xp} / ${next} XP` : ""}</span>
            </div>
            <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-muted">
              <div className="h-full rounded-full xp-bar-fill transition-all" style={{ width: `${pct}%` }} />
            </div>
          </div>
          <button
            onClick={handleClick}
            disabled={p.loading}
            className="group flex flex-1 items-center justify-center gap-2 rounded-2xl bg-gradient-primary px-5 py-3 font-display text-sm font-bold text-primary-foreground shadow-glow-primary transition-all hover:scale-[1.01] active:scale-[0.99] disabled:opacity-60 sm:flex-none sm:px-8"
          >
            {p.loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4" />}
            Earn XP
          </button>
        </div>
      </div>

      <LogActivityDialog
        open={!!openType}
        onOpenChange={(v) => { if (!v) setOpenType(null); }}
        type={openType}
        onSubmit={(typeId, subtype, duration, difficulty, note) =>
          p.logActivity(typeId, subtype, duration, difficulty, note)
        }
      />
    </>
  );
};