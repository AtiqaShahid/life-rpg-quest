import { useEffect, useState } from "react";
import { useEvents, formatTimeLeft, type EventCard } from "@/hooks/useEvents";
import { Loader2, Calendar, Globe, Sparkles, Clock, Trophy, Zap, Gift, Flame } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

const SCOPE_META = {
  weekly:   { label: "WEEKLY",   icon: Calendar, tint: "text-emerald-300", ring: "ring-emerald-400/30" },
  seasonal: { label: "SEASONAL", icon: Sparkles, tint: "text-amber-300",   ring: "ring-amber-400/30" },
  global:   { label: "GLOBAL",   icon: Globe,    tint: "text-rose-300",    ring: "ring-rose-400/30" },
} as const;

function Countdown({ ends }: { ends: string }) {
  const [, tick] = useState(0);
  useEffect(() => { const id = setInterval(() => tick(t => t + 1), 1000); return () => clearInterval(id); }, []);
  const left = formatTimeLeft(ends);
  const ms = new Date(ends).getTime() - Date.now();
  const urgent = ms < 6 * 3600 * 1000;
  return (
    <span className={cn("inline-flex items-center gap-1 font-mono text-[11px] tracking-widest", urgent ? "text-rose-300 animate-pulse" : "text-muted-foreground")}>
      <Clock className="h-3 w-3" /> {urgent ? `FINAL · ${left}` : `ENDS IN ${left}`}
    </span>
  );
}

function EventCardView({ ev, onJoin, onClaim }: { ev: EventCard; onJoin: (ev: EventCard) => void; onClaim: (id: string) => void }) {
  const meta = SCOPE_META[ev.scope];
  const Icon = meta.icon;
  const pct = ev.scope === "global" && ev.global_target
    ? Math.min(100, Math.round((ev.global_progress / ev.global_target) * 100))
    : Math.min(100, Math.round((ev.progress / Math.max(ev.target, 1)) * 100));
  const completed = ev.part_status === "completed";
  const claimed = ev.part_status === "claimed";
  const notJoined = ev.part_status === "not_joined";

  return (
    <div className="glass-strong rounded-2xl p-5 transition-all hover:ring-1 hover:ring-primary/30">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-mono text-[10px] tracking-widest ring-1", meta.tint, meta.ring)}>
              <Icon className="h-3 w-3" /> {meta.label}
            </span>
            <span className="inline-flex items-center gap-1 rounded-full bg-primary/15 px-2 py-0.5 font-mono text-[10px] tracking-widest text-primary ring-1 ring-primary/30">
              <Zap className="h-3 w-3" /> {ev.multiplier.toFixed(1)}× XP
            </span>
            {claimed && <span className="rounded-full bg-emerald-400/15 px-2 py-0.5 font-mono text-[10px] tracking-widest text-emerald-300 ring-1 ring-emerald-400/30">CLAIMED</span>}
          </div>
          <h3 className="mt-2 font-display text-lg font-semibold tracking-tight">{ev.title}</h3>
          <p className="mt-0.5 text-sm text-muted-foreground">{ev.tagline}</p>
        </div>
        <Countdown ends={ev.ends_at} />
      </div>

      <div className="mt-4">
        <div className="mb-1 flex items-center justify-between font-mono text-[10px] tracking-widest text-muted-foreground">
          <span>PROGRESS</span>
          <span>{ev.scope === "global" ? `${ev.global_progress} / ${ev.global_target}` : `${ev.progress} / ${ev.target}`} · {pct}%</span>
        </div>
        <div className="h-2.5 overflow-hidden rounded-full bg-muted">
          <div className="h-full rounded-full bg-gradient-to-r from-primary to-secondary transition-all" style={{ width: `${pct}%` }} />
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2 font-mono text-[11px] text-muted-foreground">
          <span className="inline-flex items-center gap-1"><Trophy className="h-3 w-3 text-amber-300" /> {ev.reward_xp} XP</span>
          {ev.reward_coins > 0 && <span>· {ev.reward_coins} coins</span>}
          {ev.reward_tokens > 0 && <span>· {ev.reward_tokens} tokens</span>}
          {ev.reward_item_ids?.length > 0 && (
            <span className="inline-flex items-center gap-1 text-secondary"><Gift className="h-3 w-3" /> {ev.reward_item_ids.length} exclusive</span>
          )}
        </div>
        <div className="flex gap-2">
          {completed && (
            <button onClick={() => onClaim(ev.id)} className="rounded-xl bg-gradient-primary px-4 py-2 font-display text-sm font-semibold text-primary-foreground shadow-glow-primary transition hover:opacity-90">
              Claim rewards
            </button>
          )}
          {notJoined && ev.scope === "seasonal" && (
            <button onClick={() => onJoin(ev)} className="rounded-xl bg-gradient-primary px-4 py-2 font-display text-sm font-semibold text-primary-foreground shadow-glow-primary transition hover:opacity-90">
              Join campaign
            </button>
          )}
          {!completed && !notJoined && !claimed && (
            <span className="rounded-xl border border-border/60 bg-muted/30 px-4 py-2 font-mono text-[11px] tracking-widest text-muted-foreground">
              {ev.scope === "global" ? "AUTO-TRACKING" : "IN PROGRESS"}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

export default function Events() {
  const { data, loading, join, joinSeasonal, claim } = useEvents();

  if (loading && !data) {
    return <div className="flex h-[60vh] items-center justify-center text-muted-foreground"><Loader2 className="mr-2 h-5 w-5 animate-spin" /> Loading events…</div>;
  }
  if (!data) return null;

  const handleJoin = async (ev: EventCard) => {
    try {
      if (ev.scope === "seasonal" && ev.template_id) {
        await joinSeasonal(ev.template_id);
      } else {
        await join(ev.id);
      }
      toast.success("Joined");
    } catch (e) { toast.error((e as Error).message); }
  };
  const handleClaim = async (id: string) => {
    try { const r = await claim(id); toast.success(`+${r.xp} XP · +${r.coins} coins`); } catch (e) { toast.error((e as Error).message); }
  };

  const Section = ({ title, hint, items }: { title: string; hint?: string; items: EventCard[] }) => (
    <section>
      <div className="mb-3 flex items-end justify-between">
        <h2 className="font-display text-lg font-semibold">{title}</h2>
        {hint && <span className="font-mono text-[10px] tracking-widest text-muted-foreground">{hint}</span>}
      </div>
      {items.length === 0
        ? <div className="glass rounded-2xl p-6 text-sm text-muted-foreground">Nothing here yet.</div>
        : <div className="grid gap-3 lg:grid-cols-2">{items.map(e => <EventCardView key={e.id} ev={e} onJoin={handleJoin} onClaim={handleClaim} />)}</div>}
    </section>
  );

  return (
    <div className="space-y-6">
      <header className="flex items-end justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 font-mono text-[11px] tracking-widest text-secondary">
            <Flame className="h-3.5 w-3.5" /> EVENTS · LIMITED-TIME
          </div>
          <h1 className="mt-1 font-display text-2xl font-bold neon-text-primary">Re-engagement Engine</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Active multiplier <span className="font-semibold text-primary">{data.aggregate_multiplier.toFixed(1)}×</span> · max 3 active events at once.
          </p>
        </div>
      </header>

      <Section title="Active events" hint={`${data.active.length} ACTIVE · CAP 3`} items={data.active} />
      <Section title="Global events" hint="EVERYONE · SHARED PROGRESS" items={data.global} />
      <Section title="Seasonal campaigns" hint="30-DAY ARCS · OPT-IN" items={data.seasonal} />

      {data.inventory.length > 0 && (
        <section>
          <h2 className="mb-3 font-display text-lg font-semibold">Exclusive vault</h2>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {data.inventory.map(i => (
              <div key={`${i.reward_id}-${i.acquired_at}`} className="glass rounded-2xl p-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/15 text-xl ring-1 ring-primary/30">{i.icon}</div>
                  <div className="min-w-0">
                    <div className="font-display text-sm font-semibold">{i.name}</div>
                    <div className="truncate font-mono text-[10px] uppercase tracking-widest text-muted-foreground">{i.rarity} · {i.kind}</div>
                  </div>
                </div>
                <p className="mt-2 text-xs text-muted-foreground">{i.description}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="pb-2">
        <h2 className="mb-3 font-display text-lg font-semibold">History</h2>
        {data.history.length === 0 ? (
          <div className="glass rounded-2xl p-6 text-sm text-muted-foreground">No completed events yet.</div>
        ) : (
          <div className="space-y-1.5">
            {data.history.map(h => (
              <div key={h.id} className="glass flex items-center justify-between rounded-xl px-4 py-2 text-sm">
                <div className="min-w-0">
                  <div className="truncate font-display">{h.title}</div>
                  <div className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">{h.scope} · {h.outcome} · {new Date(h.ended_at).toLocaleDateString()}</div>
                </div>
                <div className="shrink-0 font-mono text-[11px] text-muted-foreground">{h.progress}/{h.target}{h.awarded_xp ? ` · +${h.awarded_xp} XP` : ""}</div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}