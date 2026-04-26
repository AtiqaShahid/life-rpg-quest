import { useMemo, useState } from "react";
import { usePlayer, type QuestRich } from "@/hooks/usePlayer";
import { QuestCard } from "@/components/rpg/QuestCard";
import { Loader2, Plus, Scroll, Sparkles, RefreshCw, Wand2, Anchor, Compass, Flame } from "lucide-react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

export default function Quests() {
  const p = usePlayer();
  const [title, setTitle] = useState("");
  const [xp, setXp] = useState(25);
  const [busy, setBusy] = useState<"none" | "refresh-all" | `slot-${number}` | "ai" | "weekly" | "epic">("none");

  const all = p.quests as unknown as QuestRich[];
  const progressByQuest = useMemo(() => {
    const m = new Map<string, typeof p.questProgress[number]>();
    p.questProgress.forEach(qp => m.set(qp.quest_id, qp));
    return m;
  }, [p.questProgress]);

  const visible = (q: QuestRich) => q.status !== "completed" && q.status !== "discarded" && !q.completed;

  const buckets = useMemo(() => {
    const dailyAll = all.filter(q => (q.quest_type ?? (q.is_daily ? "daily" : "dynamic")) === "daily" && visible(q));
    return {
      dailyCompulsory: dailyAll.filter(q => q.is_compulsory).sort((a,b) => a.title.localeCompare(b.title)),
      dailySlots: [1,2,3].map(slot => dailyAll.find(q => !q.is_compulsory && q.slot_index === slot) ?? null),
      weeklyActive: all.filter(q => q.quest_type === "weekly" && (q.status === "active" || q.status === "locked") && visible(q)),
      weeklyCandidates: all.filter(q => q.quest_type === "weekly" && q.status === "candidate"),
      epicActive: all.filter(q => q.quest_type === "epic" && (q.status === "active" || q.status === "locked") && visible(q)),
      epicCandidates: all.filter(q => q.quest_type === "epic" && q.status === "candidate"),
      dynamicCandidates: all.filter(q => q.quest_type === "dynamic" && q.status === "candidate"),
      dynamicActive: all.filter(q => q.quest_type === "dynamic" && (q.status === "active" || q.status === "locked") && visible(q)),
      completed: all.filter(q => q.status === "completed" || q.completed),
    };
  }, [all]);

  if (p.loading) return <div className="flex h-[60vh] items-center justify-center text-muted-foreground"><Loader2 className="mr-2 h-5 w-5 animate-spin" /> Loading…</div>;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    await p.addQuest(title.trim(), xp);
    setTitle(""); setXp(25);
  };

  const refreshAllDaily = async () => { setBusy("refresh-all"); await p.regenerateAllDailySlots(); setBusy("none"); };
  const askAI   = async () => { setBusy("ai");      await p.generateDynamicQuests(); setBusy("none"); };
  const regenSlot = async (slot: number) => { setBusy(`slot-${slot}` as const); await p.regenerateDailySlot(slot); setBusy("none"); };
  const genWeekly = async () => { setBusy("weekly"); await p.generateWeeklyOptions(); setBusy("none"); };
  const genEpic   = async () => { setBusy("epic");   await p.generateEpicOptions();   setBusy("none"); };

  const renderList = (list: QuestRich[], emptyHint = "No quests here.") => (
    <div className="space-y-2">
      {list.length === 0 && (
        <div className="glass rounded-2xl p-6 text-center text-sm text-muted-foreground">{emptyHint}</div>
      )}
      {list.map(q => (
        <QuestCard
          key={q.id}
          quest={q}
          progress={progressByQuest.get(q.id)}
          onComplete={p.completeQuest}
          onRemove={p.removeQuest}
          onLock={p.lockQuest}
          onUnlock={p.unlockQuest}
        />
      ))}
    </div>
  );

  const SlotCard = ({ slot }: { slot: number }) => {
    const q = buckets.dailySlots[slot - 1];
    const isBusy = busy === `slot-${slot}`;
    if (!q) {
      return (
        <div className="glass flex items-center justify-between gap-3 rounded-2xl p-4">
          <div>
            <div className="font-mono text-[10px] tracking-widest text-muted-foreground">SLOT {slot}</div>
            <div className="mt-1 text-sm text-muted-foreground">Empty — generate a dynamic quest.</div>
          </div>
          <button onClick={() => regenSlot(slot)} disabled={busy !== "none"}
            className="inline-flex items-center gap-1.5 rounded-xl bg-gradient-primary px-3 py-2 font-display text-xs font-semibold text-primary-foreground shadow-glow-primary disabled:opacity-60">
            {isBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />} Generate
          </button>
        </div>
      );
    }
    return (
      <div className="space-y-1">
        <div className="flex items-center justify-between px-1 font-mono text-[10px] tracking-widest text-muted-foreground">
          <span>SLOT {slot}{slot === 1 ? " · easy" : slot === 2 ? " · medium" : " · hard"}</span>
          {isBusy && <Loader2 className="h-3 w-3 animate-spin" />}
        </div>
        <QuestCard
          quest={q}
          progress={progressByQuest.get(q.id)}
          onComplete={p.completeQuest}
          onLock={p.lockQuest}
          onUnlock={p.unlockQuest}
          onRegenerate={() => regenSlot(slot)}
        />
      </div>
    );
  };

  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 font-mono text-[11px] tracking-widest text-secondary"><Scroll className="h-3.5 w-3.5" /> QUEST BOARD</div>
          <h1 className="mt-1 font-display text-3xl font-bold">Quests</h1>
          <p className="mt-1 text-sm text-muted-foreground">4 fixed anchors + 3 dynamic slots daily. Lock the ones you want to keep, regenerate the rest.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={refreshAllDaily}
            disabled={busy !== "none"}
            className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-muted/40 px-3 py-2 font-display text-sm font-medium transition-colors hover:bg-muted/60 disabled:opacity-60"
          >
            {busy === "refresh-all" ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            Regenerate all
          </button>
          <button
            onClick={askAI}
            disabled={busy !== "none"}
            className="inline-flex items-center gap-1.5 rounded-xl bg-gradient-primary px-3 py-2 font-display text-sm font-semibold text-primary-foreground shadow-glow-primary transition-all hover:scale-[1.02] disabled:opacity-60"
          >
            {busy === "ai" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />}
            AI options
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
          <TabsTrigger value="daily">Daily <span className="ml-1 text-muted-foreground">{buckets.dailyCompulsory.length + buckets.dailySlots.filter(Boolean).length}</span></TabsTrigger>
          <TabsTrigger value="weekly">Weekly <span className="ml-1 text-muted-foreground">{buckets.weeklyActive.length || buckets.weeklyCandidates.length}</span></TabsTrigger>
          <TabsTrigger value="epic">Epic <span className="ml-1 text-muted-foreground">{buckets.epicActive.length || buckets.epicCandidates.length}</span></TabsTrigger>
          <TabsTrigger value="dynamic"><Sparkles className={cn("mr-1 h-3.5 w-3.5", (buckets.dynamicCandidates.length + buckets.dynamicActive.length) && "text-primary")} />AI <span className="ml-1 text-muted-foreground">{buckets.dynamicCandidates.length + buckets.dynamicActive.length}</span></TabsTrigger>
          <TabsTrigger value="completed">Done <span className="ml-1 text-muted-foreground">{buckets.completed.length}</span></TabsTrigger>
        </TabsList>

        <TabsContent value="daily" className="mt-4 space-y-6">
          <section>
            <div className="mb-2 flex items-center gap-2 font-mono text-[11px] tracking-widest text-emerald-300">
              <Anchor className="h-3.5 w-3.5" /> COMPULSORY ANCHORS · 4 fixed
            </div>
            {renderList(buckets.dailyCompulsory, "Anchors will appear shortly…")}
          </section>
          <section>
            <div className="mb-2 flex items-center justify-between">
              <div className="flex items-center gap-2 font-mono text-[11px] tracking-widest text-secondary">
                <Sparkles className="h-3.5 w-3.5" /> DYNAMIC SLOTS · 3
              </div>
              <span className="text-[10px] text-muted-foreground">Lock to keep · regenerate individually</span>
            </div>
            <div className="space-y-3">
              {[1,2,3].map(s => <SlotCard key={s} slot={s} />)}
            </div>
          </section>
        </TabsContent>

        <TabsContent value="weekly" className="mt-4 space-y-4">
          {buckets.weeklyActive.length > 0 ? (
            <>
              <div className="flex items-center gap-2 font-mono text-[11px] tracking-widest text-sky-300"><Compass className="h-3.5 w-3.5" /> ACTIVE WEEKLY MISSION</div>
              {renderList(buckets.weeklyActive)}
            </>
          ) : buckets.weeklyCandidates.length > 0 ? (
            <>
              <div className="flex items-center justify-between">
                <div className="font-mono text-[11px] tracking-widest text-violet-300">PICK ONE WEEKLY MISSION</div>
                <button onClick={genWeekly} disabled={busy !== "none"} className="text-xs text-muted-foreground hover:text-foreground">↻ Regenerate options</button>
              </div>
              <div className="space-y-2">
                {buckets.weeklyCandidates.map(q => (
                  <QuestCard key={q.id} quest={q} progress={progressByQuest.get(q.id)} variant="candidate"
                    onComplete={() => {}} onSelect={p.selectQuestOption} />
                ))}
              </div>
            </>
          ) : (
            <div className="glass rounded-2xl p-6 text-center text-sm text-muted-foreground">
              No weekly mission yet.
              <div className="mt-3">
                <button onClick={genWeekly} disabled={busy !== "none"}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-gradient-primary px-3 py-2 font-display text-sm font-semibold text-primary-foreground shadow-glow-primary disabled:opacity-60">
                  {busy === "weekly" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                  Generate 3 options
                </button>
              </div>
            </div>
          )}
        </TabsContent>

        <TabsContent value="epic" className="mt-4 space-y-4">
          {buckets.epicActive.length > 0 ? (
            <>
              <div className="flex items-center gap-2 font-mono text-[11px] tracking-widest text-amber-300"><Flame className="h-3.5 w-3.5" /> EPIC QUEST IN PROGRESS</div>
              {renderList(buckets.epicActive)}
            </>
          ) : buckets.epicCandidates.length > 0 ? (
            <>
              <div className="flex items-center justify-between">
                <div className="font-mono text-[11px] tracking-widest text-violet-300">CHOOSE YOUR EPIC PATH</div>
                <button onClick={genEpic} disabled={busy !== "none"} className="text-xs text-muted-foreground hover:text-foreground">↻ Regenerate options</button>
              </div>
              <div className="space-y-2">
                {buckets.epicCandidates.map(q => (
                  <QuestCard key={q.id} quest={q} progress={progressByQuest.get(q.id)} variant="candidate"
                    onComplete={() => {}} onSelect={p.selectQuestOption} />
                ))}
              </div>
            </>
          ) : (
            <div className="glass rounded-2xl p-6 text-center text-sm text-muted-foreground">
              No epic quest yet — these are 30-day commitments.
              <div className="mt-3">
                <button onClick={genEpic} disabled={busy !== "none"}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-gradient-primary px-3 py-2 font-display text-sm font-semibold text-primary-foreground shadow-glow-primary disabled:opacity-60">
                  {busy === "epic" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Flame className="h-4 w-4" />}
                  Generate 3 options
                </button>
              </div>
            </div>
          )}
        </TabsContent>

        <TabsContent value="dynamic" className="mt-4 space-y-4">
          {buckets.dynamicCandidates.length > 0 && (
            <section>
              <div className="mb-2 font-mono text-[11px] tracking-widest text-violet-300">AI OPTIONS · pick to lock</div>
              <div className="space-y-2">
                {buckets.dynamicCandidates.map(q => (
                  <QuestCard key={q.id} quest={q} progress={progressByQuest.get(q.id)} variant="candidate"
                    onComplete={() => {}} onSelect={p.selectQuestOption} />
                ))}
              </div>
            </section>
          )}
          {buckets.dynamicActive.length > 0 && (
            <section>
              <div className="mb-2 font-mono text-[11px] tracking-widest text-muted-foreground">LOCKED AI QUESTS</div>
              {renderList(buckets.dynamicActive)}
            </section>
          )}
          {buckets.dynamicCandidates.length === 0 && buckets.dynamicActive.length === 0 && (
            <div className="glass rounded-2xl p-6 text-center text-sm text-muted-foreground">
              No AI quests yet — tap <span className="font-mono">AI options</span> above.
            </div>
          )}
        </TabsContent>

        <TabsContent value="completed" className="mt-4">{renderList(buckets.completed, "No completed quests yet.")}</TabsContent>
      </Tabs>
    </div>
  );
}
