import { useMemo } from "react";
import { useDepth, useAdaptive, type DepthSnapshot } from "@/hooks/useDepth";
import { Loader2, Activity, Brain, Zap, Heart, AlertTriangle, Sparkles, ShieldAlert, TrendingUp, Lightbulb, Info, Waves } from "lucide-react";
import { cn } from "@/lib/utils";

const NODE_ICON: Record<string, typeof Brain> = {
  discipline: ShieldAlert,
  energy: Zap,
  intelligence: Brain,
  consistency: Activity,
  burnout: Heart,
};

function NodeOrb({ id, label, value, negative }: { id: string; label: string; value: number; negative?: boolean }) {
  const Icon = NODE_ICON[id] ?? Sparkles;
  const tone = negative
    ? value > 60 ? "from-rose-500/40 to-rose-500/10 ring-rose-400/40 text-rose-200"
      : value > 30 ? "from-amber-500/30 to-amber-500/10 ring-amber-400/30 text-amber-200"
      : "from-emerald-500/20 to-emerald-500/5 ring-emerald-400/20 text-emerald-200"
    : value >= 70 ? "from-emerald-500/30 to-emerald-500/5 ring-emerald-400/30 text-emerald-200"
    : value >= 40 ? "from-primary/30 to-primary/5 ring-primary/40 text-primary"
    : "from-muted/40 to-muted/5 ring-muted-foreground/20 text-muted-foreground";
  return (
    <div className={cn("relative flex aspect-square flex-col items-center justify-center gap-1 rounded-2xl bg-gradient-to-br p-3 ring-1 transition-all hover:scale-[1.02]", tone)}>
      <Icon className="h-5 w-5" />
      <div className="font-mono text-[9px] uppercase tracking-widest opacity-80">{label}</div>
      <div className="font-display text-xl font-bold leading-none">{Math.round(value)}</div>
      <div className="absolute inset-x-2 bottom-1.5 h-1 overflow-hidden rounded-full bg-background/40">
        <div className={cn("h-full rounded-full transition-all", negative ? "bg-rose-400" : "bg-current opacity-80")} style={{ width: `${Math.min(100, value)}%` }} />
      </div>
    </div>
  );
}

function EdgeRow({ edge }: { edge: DepthSnapshot["edges"][number] }) {
  const positive = edge.kind === "positive";
  return (
    <div className="flex items-center gap-2 rounded-lg border border-border/40 bg-background/30 px-3 py-1.5 text-xs">
      <span className="font-mono uppercase tracking-widest text-muted-foreground">{edge.from}</span>
      <span className={cn("font-mono", positive ? "text-emerald-300" : "text-rose-300")}>
        {positive ? "→" : "⊣"}
      </span>
      <span className="font-mono uppercase tracking-widest">{edge.to}</span>
      <span className="ml-auto font-mono text-[10px] text-muted-foreground">{edge.label} · w{edge.weight.toFixed(2)}</span>
    </div>
  );
}

function MultiplierGauge({ value }: { value: number }) {
  const pct = Math.max(0, Math.min(100, ((value - 0.3) / (1.8 - 0.3)) * 100));
  const tone = value >= 1.1 ? "text-emerald-300" : value >= 0.95 ? "text-primary" : value >= 0.8 ? "text-amber-300" : "text-rose-300";
  return (
    <div className="glass-strong rounded-2xl p-5">
      <div className="flex items-center justify-between">
        <div>
          <div className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">Live XP multiplier</div>
          <div className={cn("mt-1 font-display text-4xl font-bold", tone)}>{value.toFixed(2)}×</div>
        </div>
        <Sparkles className={cn("h-8 w-8", tone)} />
      </div>
      <div className="mt-3 h-2 overflow-hidden rounded-full bg-muted">
        <div className={cn("h-full rounded-full bg-gradient-to-r", value >= 1 ? "from-primary to-emerald-400" : "from-rose-400 to-amber-400")} style={{ width: `${pct}%` }} />
      </div>
      <div className="mt-1 flex justify-between font-mono text-[9px] uppercase tracking-widest text-muted-foreground">
        <span>0.30×</span><span>1.00×</span><span>1.80×</span>
      </div>
    </div>
  );
}

function FrictionPanel({ snap }: { snap: DepthSnapshot }) {
  const f = snap.friction;
  const state = f.streak_state;
  const tone = state === "stable" ? "text-emerald-300 border-emerald-400/30 bg-emerald-400/10"
    : state === "unstable" ? "text-amber-300 border-amber-400/30 bg-amber-400/10"
    : "text-rose-300 border-rose-400/30 bg-rose-400/10";
  return (
    <div className="glass-strong rounded-2xl p-5">
      <div className="flex items-center justify-between">
        <div className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">Streak quality</div>
        <span className={cn("rounded-full border px-2 py-0.5 font-mono text-[10px] uppercase tracking-widest", tone)}>{state}</span>
      </div>
      <div className="mt-2 font-display text-2xl font-bold">
        {f.value >= 1 ? "+" : ""}{Math.round((f.value - 1) * 100)}% friction
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        {state === "stable" && f.value >= 1 && "All systems flowing. Output at full strength."}
        {state === "unstable" && "Recover by logging activity within 36h to stabilize."}
        {f.value < 1 && state !== "unstable" && "Burnout/missed-day friction throttling output."}
        {f.comeback_until && new Date(f.comeback_until) > new Date() && " · Comeback bonus available."}
      </p>
    </div>
  );
}

export default function Depth() {
  const { data, loading } = useDepth();
  const { data: adaptive } = useAdaptive();

  const grouped = useMemo(() => {
    if (!data) return null;
    const nodes = data.snapshot.nodes;
    return {
      positive: nodes.filter(n => !n.negative),
      negative: nodes.filter(n => n.negative),
    };
  }, [data]);

  if (loading && !data) {
    return <div className="flex h-[60vh] items-center justify-center text-muted-foreground"><Loader2 className="mr-2 h-5 w-5 animate-spin" /> Reading depth state…</div>;
  }
  if (!data || !grouped) return null;
  const snap = data.snapshot;

  return (
    <div className="space-y-6">
      <header>
        <div className="flex items-center gap-2 font-mono text-[11px] tracking-widest text-secondary">
          <Brain className="h-3.5 w-3.5" /> DEPTH ENGINE · GRAPH-BASED STATS
        </div>
        <h1 className="mt-1 font-display text-2xl font-bold neon-text-primary">System Depth</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">Stats are connected. Friction replaces punishment. Read the graph, play the long game.</p>
      </header>

      <div className="grid gap-3 md:grid-cols-2">
        <MultiplierGauge value={snap.xp_multiplier} />
        <FrictionPanel snap={snap} />
      </div>

      {adaptive && (
        <section className="glass rounded-2xl border border-secondary/20 p-4">
          <div className="flex items-center gap-2">
            <Waves className="h-4 w-4 text-secondary" />
            <div className="font-mono text-[10px] uppercase tracking-widest text-secondary">Adaptive engine</div>
            <span className={cn(
              "ml-auto rounded-full border px-2 py-0.5 font-mono text-[10px] uppercase tracking-widest",
              adaptive.state.mode === "momentum" && "border-emerald-400/30 bg-emerald-400/10 text-emerald-200",
              adaptive.state.mode === "recovery" && "border-amber-400/30 bg-amber-400/10 text-amber-200",
              adaptive.state.mode === "intervention" && "border-rose-400/30 bg-rose-400/10 text-rose-200",
              adaptive.state.mode === "stable" && "border-primary/30 bg-primary/10 text-primary",
            )}>
              {adaptive.state.mode}
            </span>
          </div>
          <p className="mt-1.5 text-sm text-foreground/90">{adaptive.state.rationale}</p>
        </section>
      )}

      <section className="glass-strong rounded-2xl p-5">
        <div className="mb-3 flex items-end justify-between">
          <h2 className="font-display text-lg font-semibold">Stat graph</h2>
          <span className="font-mono text-[10px] tracking-widest text-muted-foreground">5 NODES · {snap.edges.length} EDGES</span>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-5">
          {grouped.positive.map(n => <NodeOrb key={n.id} {...n} />)}
          {grouped.negative.map(n => <NodeOrb key={n.id} {...n} />)}
        </div>
        <div className="mt-4 grid gap-1.5 lg:grid-cols-2">
          {snap.edges.map((e, i) => <EdgeRow key={i} edge={e} />)}
        </div>
      </section>

      <div className="grid gap-3 lg:grid-cols-3">
        <section className="glass-strong rounded-2xl p-5">
          <div className="mb-2 flex items-center gap-2 text-sm font-display font-semibold"><Lightbulb className="h-4 w-4 text-amber-300" /> Insights</div>
          {snap.insights.length === 0
            ? <p className="text-xs text-muted-foreground">Log a few more activities — the engine needs signal.</p>
            : <ul className="space-y-1.5 text-sm">{snap.insights.map((i, k) => <li key={k} className="flex gap-2"><Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" /><span>{i}</span></li>)}</ul>}
        </section>

        <section className="glass-strong rounded-2xl p-5">
          <div className="mb-2 flex items-center gap-2 text-sm font-display font-semibold"><AlertTriangle className="h-4 w-4 text-rose-300" /> Predictions</div>
          {snap.predictions.length === 0
            ? <p className="text-xs text-muted-foreground">No risk signals detected.</p>
            : <ul className="space-y-1.5 text-sm">{snap.predictions.map((p, k) => <li key={k} className="rounded-lg border border-rose-400/20 bg-rose-400/5 px-2 py-1.5 text-rose-200/90">{p}</li>)}</ul>}
        </section>

        <section className="glass-strong rounded-2xl p-5">
          <div className="mb-2 flex items-center gap-2 text-sm font-display font-semibold"><TrendingUp className="h-4 w-4 text-primary" /> Recommendations</div>
          {snap.recommendations.length === 0
            ? <p className="text-xs text-muted-foreground">Keep going — current pattern is healthy.</p>
            : <ul className="space-y-1.5">{snap.recommendations.map((r, k) => (
                <li key={k} className="rounded-lg border border-primary/20 bg-primary/5 p-2.5">
                  <div className="font-display text-sm">{r.label}</div>
                  <div className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">{r.reason}</div>
                </li>
              ))}</ul>}
        </section>
      </div>

      <section>
        <h2 className="mb-3 font-display text-lg font-semibold">Depth timeline</h2>
        {data.events.length === 0 ? (
          <div className="glass rounded-2xl p-6 text-sm text-muted-foreground">Nothing to show yet. Friction events, comeback bonuses and burnout spikes will appear here.</div>
        ) : (
          <div className="space-y-1.5">
            {data.events.map(e => (
              <div key={e.id} className="glass flex items-center justify-between rounded-xl px-4 py-2 text-sm">
                <div className="min-w-0">
                  <div className="truncate font-display">{e.message}</div>
                  <div className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">{e.kind}</div>
                </div>
                <div className="shrink-0 font-mono text-[10px] text-muted-foreground">{new Date(e.created_at).toLocaleString()}</div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}