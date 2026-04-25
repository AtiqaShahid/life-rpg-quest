import { useState } from "react";
import { usePlayer, ActivityType } from "@/hooks/usePlayer";
import { CharacterCard } from "@/components/rpg/CharacterCard";
import { ActivityPicker } from "@/components/rpg/ActivityPicker";
import { QuestCard } from "@/components/rpg/QuestCard";
import { ActivityFeed } from "@/components/rpg/ActivityFeed";
import { LogActivityDialog } from "@/components/rpg/LogActivityDialog";
import { Loader2, Scroll, Zap, Activity as ActivityIcon } from "lucide-react";

const SectionTitle = ({ icon: Icon, title, hint }: { icon: React.ComponentType<{ className?: string }>; title: string; hint?: string }) => (
  <div className="mb-3 flex items-end justify-between">
    <div className="flex items-center gap-2">
      <Icon className="h-4 w-4 text-secondary" />
      <h2 className="font-display text-lg font-semibold tracking-tight">{title}</h2>
    </div>
    {hint && <span className="font-mono text-[10px] tracking-widest text-muted-foreground">{hint}</span>}
  </div>
);

export default function Dashboard() {
  const p = usePlayer();
  const [openType, setOpenType] = useState<ActivityType | null>(null);
  if (p.loading || !p.profile || !p.stats || !p.streak) {
    return <div className="flex h-[60vh] items-center justify-center text-muted-foreground"><Loader2 className="mr-2 h-5 w-5 animate-spin" /> Loading your save…</div>;
  }

  const dailyQuests = p.quests.filter(q => q.is_daily);
  const completedToday = dailyQuests.filter(q => q.completed).length;

  return (
    <div className="space-y-6 sm:space-y-8">
      <CharacterCard profile={p.profile} stats={p.stats} streak={p.streak} xpFlash={p.xpFlash} levelUpFlash={p.levelUpFlash} />

      <section>
        <SectionTitle icon={Zap} title="Quick log" hint="PICK • DURATION • XP" />
        <ActivityPicker
          types={p.activityTypes.slice(0, 8)}
          onPick={(id) => {
            const t = p.activityTypes.find(a => a.id === id);
            if (t) setOpenType(t);
          }}
          compact
        />
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <section>
          <SectionTitle icon={Scroll} title="Daily quests" hint={`${completedToday}/${dailyQuests.length} DONE`} />
          <div className="space-y-2">
            {dailyQuests.map(q => <QuestCard key={q.id} quest={q} onComplete={p.completeQuest} />)}
            {dailyQuests.length === 0 && (
              <div className="glass rounded-2xl p-6 text-sm text-muted-foreground">No daily quests yet. Add some in the Quests tab.</div>
            )}
          </div>
        </section>

        <section>
          <SectionTitle icon={ActivityIcon} title="Recent activity" />
          <ActivityFeed activities={p.activities} types={p.activityTypes} />
        </section>
      </div>

      <LogActivityDialog
        open={!!openType}
        onOpenChange={(v) => { if (!v) setOpenType(null); }}
        type={openType}
        onSubmit={(typeId, subtype, duration, note) => p.logActivity(typeId, subtype, duration, note)}
      />
    </div>
  );
}
