import { useMemo, useState } from "react";
import { usePlayer, type QuestRich } from "@/hooks/usePlayer";
import { QuestCard } from "@/components/rpg/QuestCard";
import { Loader2, Plus, Scroll, Sparkles, RefreshCw, Wand2 } from "lucide-react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

export default function Quests() {
  const p = usePlayer();
  const [title, setTitle] = useState("");
  const [xp, setXp] = useState(25);
  const [busy, setBusy] = useState<"none" | "refresh" | "ai">("none");

  const all = p.quests as unknown as QuestRich[];
  const progressByQuest = useMemo(() => {
    const m = new Map<string, typeof p.questProgress[number]>();
    p.questProgress.forEach(qp => m.set(qp.quest_id, qp));
    return m;
  }, [p.questProgress]);

  const buckets = useMemo(() => ({
    daily:   all.filter(q => (q.quest_type ?? (q.is_daily ? "daily" : "dynamic")) === "daily"   && q.status !== "completed"),
    weekly:  all.filter(q => q.quest_type === "weekly"  && q.status !== "completed"),
    epic:    all.filter(q => q.quest_type === "epic"    && q.status !== "completed"),
    dynamic: all.filter(q => q.quest_type === "dynamic" && q.status !== "completed"),
    completed: all.filter(q => q.status === "completed" || q.completed),
  }), [all]);

  if (p.loading) return <div className="flex h-[60vh] items-center justify-center text-muted-foreground"><Loader2 className="mr-2 h-5 w-5 animate-spin" /> Loading…</div>;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    await p.addQuest(title.trim(), xp);
    setTitle(""); setXp(25);
  };

  const refresh = async () => { setBusy("refresh"); await p.generateQuests(true); setBusy("none"); };
  const askAI   = async () => { setBusy("ai");      await p.generateDynamicQuests(); setBusy("none"); };

  const renderList = (list: QuestRich[]) => (
    <div className="space-y-2">
      {list.length === 0 && (
        <div className="glass rounded-2xl p-6 text-center text-sm text-muted-foreground">
          No quests in this bucket. Tap <span className="font-mono">Refresh quests</span> to generate some.
        </div>
      )}
      {list.map(q => (
        <QuestCard
          key={q.id}
          quest={q}
          progress={progressByQuest.get(q.id)}
          onComplete={p.completeQuest}
          onRemove={p.removeQuest}
        />
      ))}
    </div>
  );

  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 font-mono text-[11px] tracking-widest text-secondary"><Scroll className="h-3.5 w-3.5" /> QUEST BOARD</div>
          <h1 className="mt-1 font-display text-3xl font-bold">Quests</h1>
          <p className="mt-1 text-sm text-muted-foreground">Adaptive missions tuned to your behavior. Logging activities auto-progresses matching quests.</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={refresh}
            disabled={busy !== "none"}
            className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-muted/40 px-3 py-2 font-display text-sm font-medium transition-colors hover:bg-muted/60 disabled:opacity-60"
          >
            {busy === "refresh" ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            Refresh quests
          </button>
          <button
            onClick={askAI}
            disabled={busy !== "none"}
            className="inline-flex items-center gap-1.5 rounded-xl bg-gradient-primary px-3 py-2 font-display text-sm font-semibold text-primary-foreground shadow-glow-primary transition-all hover:scale-[1.02] disabled:opacity-60"
          >
            {busy === "ai" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />}
            AI quests
          </button>
        </div>
      </header>

      <section className="glass-strong rounded-3xl p-5 sm:p-6">
        <h2 className="mb-3 font-display text-base font-semibold">Create a custom quest</h2>
        <form onSubmit={submit} className="grid gap-3 sm:grid-cols-[1fr,auto,auto]">
          <input
            value={title} onChange={e => setTitle(e.target.value)}
            placeholder="e.g. Finish project chapter 3"
            className="w-full rounded-xl bg-muted/40 px-4 py-2.5 text-sm outline-none ring-1 ring-border focus:ring-primary"
          />
          <input
            type="number" min={5} max={500} step={5}
            value={xp} onChange={e => setXp(Number(e.target.value) || 25)}
            className="w-24 rounded-xl bg-muted/40 px-4 py-2.5 text-sm outline-none ring-1 ring-border focus:ring-primary"
          />
          <button type="submit" className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-gradient-primary px-4 py-2.5 font-display text-sm font-semibold text-primary-foreground shadow-glow-primary transition-all hover:scale-[1.02]">
            <Plus className="h-4 w-4" /> Add
          </button>
        </form>
      </section>

      <Tabs defaultValue="daily" className="w-full">
        <TabsList className="grid w-full grid-cols-5">
          <TabsTrigger value="daily">Daily <span className="ml-1 text-muted-foreground">{buckets.daily.length}</span></TabsTrigger>
          <TabsTrigger value="weekly">Weekly <span className="ml-1 text-muted-foreground">{buckets.weekly.length}</span></TabsTrigger>
          <TabsTrigger value="epic">Epic <span className="ml-1 text-muted-foreground">{buckets.epic.length}</span></TabsTrigger>
          <TabsTrigger value="dynamic"><Sparkles className={cn("mr-1 h-3.5 w-3.5", buckets.dynamic.length && "text-primary")} />AI <span className="ml-1 text-muted-foreground">{buckets.dynamic.length}</span></TabsTrigger>
          <TabsTrigger value="completed">Done <span className="ml-1 text-muted-foreground">{buckets.completed.length}</span></TabsTrigger>
        </TabsList>
        <TabsContent value="daily" className="mt-4">{renderList(buckets.daily)}</TabsContent>
        <TabsContent value="weekly" className="mt-4">{renderList(buckets.weekly)}</TabsContent>
        <TabsContent value="epic" className="mt-4">{renderList(buckets.epic)}</TabsContent>
        <TabsContent value="dynamic" className="mt-4">{renderList(buckets.dynamic)}</TabsContent>
        <TabsContent value="completed" className="mt-4">{renderList(buckets.completed)}</TabsContent>
      </Tabs>
    </div>
  );
}
