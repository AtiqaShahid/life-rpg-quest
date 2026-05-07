import { useMemo } from "react";
import { usePlayer, type QuestRich } from "@/hooks/usePlayer";
import { QuestCard } from "@/components/rpg/QuestCard";
import { Loader2, Scroll, Compass, Flame, Anchor } from "lucide-react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";

export default function Quests() {
  const p = usePlayer();

  const all = p.quests as unknown as QuestRich[];
  const progressByQuest = useMemo(() => {
    const m = new Map<string, typeof p.questProgress[number]>();
    p.questProgress.forEach(qp => m.set(qp.quest_id, qp));
    return m;
  }, [p.questProgress]);

  const visible = (q: QuestRich) => q.status !== "completed" && q.status !== "discarded" && !q.completed;

  const buckets = useMemo(() => {
    const isRunning = (s: string) => s === "active" || s === "locked" || s === "in_progress" || s === "paused";
    const dailies = all
      .filter(q => (q.quest_type ?? (q.is_daily ? "daily" : "dynamic")) === "daily" && visible(q))
      .sort((a, b) => (a.slot_index ?? 99) - (b.slot_index ?? 99));
    const weeklies = all
      .filter(q => q.quest_type === "weekly" && isRunning(q.status) && visible(q))
      .sort((a, b) => (a.slot_index ?? 99) - (b.slot_index ?? 99));
    const epics = all.filter(q => q.quest_type === "epic" && isRunning(q.status) && visible(q));
    const epicCandidates = all.filter(q => q.quest_type === "epic" && q.status === "candidate");
    const completed = all.filter(q => q.status === "completed" || q.completed).slice(0, 30);
    return { dailies, weeklies, epics, epicCandidates, completed };
  }, [all]);

  if (p.loading) {
    return <div className="flex h-[60vh] items-center justify-center text-muted-foreground"><Loader2 className="mr-2 h-5 w-5 animate-spin" /> Loading…</div>;
  }

  const runningId = p.activeTimedQuest?.id ?? null;
  const isLockedGlobally = !!runningId;

  const cardProps = (q: QuestRich) => ({
    quest: q,
    progress: progressByQuest.get(q.id),
    onComplete: p.completeQuest,
    onStart: p.startQuest,
    onPause: p.pauseQuest,
    onResume: p.resumeQuest,
    onAbandon: p.abandonQuest,
    globallyLocked: isLockedGlobally && q.id !== runningId,
  });

  const renderList = (list: QuestRich[], emptyHint: string) => (
    <div className="space-y-2">
      {list.length === 0 ? (
        <div className="glass rounded-2xl p-6 text-center text-sm text-muted-foreground">{emptyHint}</div>
      ) : (
        list.map(q => <QuestCard key={q.id} {...cardProps(q)} />)
      )}
    </div>
  );

  return (
    <div className="space-y-8">
      {p.activeTimedQuest && (
        <div className="glass-strong sticky top-2 z-30 flex items-center gap-3 rounded-2xl p-3 ring-2 ring-primary/40 shadow-glow-primary">
          <Loader2 className="h-4 w-4 animate-pulse text-primary" />
          <div className="min-w-0 flex-1">
            <div className="font-mono text-[10px] tracking-widest text-secondary">FOCUS LOCK</div>
            <div className="truncate font-display text-sm font-semibold">{p.activeTimedQuest.title}</div>
          </div>
          <span className="font-mono text-[11px] text-muted-foreground">other quests are locked</span>
        </div>
      )}

      <header>
        <div className="flex items-center gap-2 font-mono text-[11px] tracking-widest text-secondary">
          <Scroll className="h-3.5 w-3.5" /> MISSION BOARD
        </div>
        <h1 className="mt-1 font-display text-3xl font-bold">Quests</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          3 fresh daily missions every day · 3 strategic weekly missions every Monday · epic quests are earned, not spammed.
        </p>
      </header>

      <Tabs defaultValue="daily" className="w-full">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="daily">Daily <span className="ml-1 text-muted-foreground">{buckets.dailies.length}/3</span></TabsTrigger>
          <TabsTrigger value="weekly">Weekly <span className="ml-1 text-muted-foreground">{buckets.weeklies.length}/3</span></TabsTrigger>
          <TabsTrigger value="epic">Epic <span className="ml-1 text-muted-foreground">{buckets.epics.length}</span></TabsTrigger>
          <TabsTrigger value="completed">Done <span className="ml-1 text-muted-foreground">{buckets.completed.length}</span></TabsTrigger>
        </TabsList>

        <TabsContent value="daily" className="mt-4 space-y-3">
          <div className="flex items-center gap-2 font-mono text-[11px] tracking-widest text-emerald-300">
            <Anchor className="h-3.5 w-3.5" /> TODAY'S 3 MISSIONS · resets at local midnight
          </div>
          {renderList(buckets.dailies, "Generating today's missions…")}
          <div className="glass rounded-2xl p-3 text-center text-[11px] text-muted-foreground">
            Timed quests reward full XP. Instant habits give reduced XP — no farming.
          </div>
        </TabsContent>

        <TabsContent value="weekly" className="mt-4 space-y-3">
          <div className="flex items-center gap-2 font-mono text-[11px] tracking-widest text-sky-300">
            <Compass className="h-3.5 w-3.5" /> THIS WEEK'S 3 MISSIONS · resets every Monday
          </div>
          {renderList(buckets.weeklies, "Generating this week's missions…")}
        </TabsContent>

        <TabsContent value="epic" className="mt-4 space-y-3">
          <div className="flex items-center gap-2 font-mono text-[11px] tracking-widest text-amber-300">
            <Flame className="h-3.5 w-3.5" /> EPIC QUESTS · milestone-only
          </div>
          {buckets.epics.length > 0 ? (
            renderList(buckets.epics, "")
          ) : buckets.epicCandidates.length > 0 ? (
            <div className="space-y-2">
              <div className="font-mono text-[10px] tracking-widest text-violet-300">CHOOSE YOUR EPIC PATH</div>
              {buckets.epicCandidates.map(q => (
                <QuestCard key={q.id} quest={q} progress={progressByQuest.get(q.id)} variant="candidate"
                  onComplete={() => {}} onSelect={p.selectQuestOption} />
              ))}
            </div>
          ) : (
            <div className="glass rounded-2xl p-6 text-center text-sm text-muted-foreground">
              No epic quest active. Epic challenges unlock on milestones — keep grinding.
              <div className="mt-3">
                <button
                  onClick={() => p.generateEpicOptions()}
                  disabled={isLockedGlobally}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-gradient-primary px-3 py-2 font-display text-sm font-semibold text-primary-foreground shadow-glow-primary disabled:opacity-60"
                >
                  <Flame className="h-4 w-4" /> Request epic challenge
                </button>
              </div>
            </div>
          )}
        </TabsContent>

        <TabsContent value="completed" className="mt-4">
          {renderList(buckets.completed, "No completed quests yet.")}
        </TabsContent>
      </Tabs>
    </div>
  );
}
