import { Activity, ActivityType } from "@/hooks/usePlayer";
import * as Lucide from "lucide-react";
import { statMeta } from "@/lib/rpg";
import { formatDistanceToNow } from "date-fns";

export const ActivityFeed = ({ activities, types }: { activities: Activity[]; types: ActivityType[] }) => {
  if (!activities.length) {
    return (
      <div className="glass rounded-2xl p-8 text-center">
        <div className="text-sm text-muted-foreground">No activities yet — log your first one to start your journey ✨</div>
      </div>
    );
  }
  return (
    <div className="space-y-2">
      {activities.slice(0, 12).map(a => {
        const t = types.find(x => x.id === a.type_id);
        const Icon = t ? ((Lucide as unknown as Record<string, Lucide.LucideIcon>)[t.icon] ?? Lucide.Zap) : Lucide.Zap;
        const color = t ? `hsl(${statMeta[t.stat].colorVar})` : "hsl(var(--primary))";
        return (
          <div key={a.id} className="glass flex items-center gap-3 rounded-xl p-3 animate-fade-in">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg ring-1 ring-white/10"
              style={{ background: `${color.replace(")", " / 0.15)")}`, color }}>
              <Icon className="h-4 w-4" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate font-medium leading-tight">{t?.label ?? a.type_id}</div>
              {a.note && <div className="truncate text-xs text-muted-foreground">{a.note}</div>}
            </div>
            <div className="text-right">
              <div className="font-mono text-sm font-semibold text-secondary">+{a.xp_gained} XP</div>
              <div className="font-mono text-[10px] text-muted-foreground">
                {formatDistanceToNow(new Date(a.created_at), { addSuffix: true })}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
};
