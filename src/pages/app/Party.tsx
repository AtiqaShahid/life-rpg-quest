import { useState } from "react";
import { useSocial } from "@/hooks/useSocial";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Progress } from "@/components/ui/progress";
import { Crown, Flame, LogOut, Shield, Users, X, Copy, Trophy } from "lucide-react";
import { toast } from "sonner";

export default function PartyPage() {
  const { user } = useAuth();
  const s = useSocial();
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [goalTitle, setGoalTitle] = useState("");
  const [goalTarget, setGoalTarget] = useState(20);

  if (!s.party) {
    return (
      <div className="space-y-6">
        <header>
          <h1 className="font-display text-2xl font-bold neon-text-primary">Party</h1>
          <p className="text-sm text-muted-foreground">Form a small accountability group of 2–5 members.</p>
        </header>
        <div className="grid gap-4 md:grid-cols-2">
          <div className="glass rounded-2xl p-5">
            <h2 className="mb-2 font-semibold">Create a party</h2>
            <div className="flex gap-2">
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Party name" />
              <Button onClick={() => name.trim() && s.createParty(name.trim())}>Create</Button>
            </div>
          </div>
          <div className="glass rounded-2xl p-5">
            <h2 className="mb-2 font-semibold">Join with code</h2>
            <div className="flex gap-2">
              <Input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="ABC123" maxLength={6} />
              <Button variant="secondary" onClick={() => code.trim() && s.joinParty(code.trim())}>Join</Button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const isLeader = s.party.leader_id === user?.id;
  const todayIso = new Date().toISOString().slice(0, 10);

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold neon-text-primary">{s.party.name}</h1>
          <p className="text-sm text-muted-foreground">Level {s.party.level} • {s.party.xp_pool} XP pool</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            className="glass flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs font-mono"
            onClick={() => { navigator.clipboard.writeText(s.party!.invite_code); toast.success("Code copied"); }}
          >
            <Copy className="h-3 w-3" /> {s.party.invite_code}
          </button>
          <Button size="sm" variant="ghost" onClick={s.leaveParty}>
            <LogOut className="mr-1 h-4 w-4" /> Leave
          </Button>
        </div>
      </header>

      <div className="grid gap-4 md:grid-cols-3">
        <div className="glass rounded-2xl p-4">
          <div className="flex items-center gap-2 text-xs text-muted-foreground"><Flame className="h-3 w-3 text-orange-400" /> Shared streak</div>
          <div className="mt-1 font-display text-2xl font-bold">{s.party.shared_streak} days</div>
          <div className="text-[11px] text-muted-foreground">Best: {s.party.longest_shared_streak}</div>
        </div>
        <div className="glass rounded-2xl p-4">
          <div className="flex items-center gap-2 text-xs text-muted-foreground"><Users className="h-3 w-3" /> Members</div>
          <div className="mt-1 font-display text-2xl font-bold">{s.members.length}/5</div>
        </div>
        <div className="glass rounded-2xl p-4">
          <div className="flex items-center gap-2 text-xs text-muted-foreground"><Shield className="h-3 w-3" /> Accountability</div>
          <div className="mt-2 flex items-center gap-2">
            <Switch
              checked={s.party.accountability_mode}
              disabled={!isLeader}
              onCheckedChange={(v) => s.updatePartySettings(null, v)}
            />
            <span className="text-xs text-muted-foreground">Soft −3% XP if a member misses (1 grace/week)</span>
          </div>
        </div>
      </div>

      <section className="glass rounded-2xl p-5">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="flex items-center gap-2 font-semibold"><Trophy className="h-4 w-4 text-secondary" /> Weekly goal</h2>
        </div>
        {s.goal ? (
          <div>
            <div className="mb-1 flex items-center justify-between text-sm">
              <span>{s.goal.title}</span>
              <span className="font-mono text-xs">{s.goal.current}/{s.goal.target}</span>
            </div>
            <Progress value={Math.min(100, Math.round((s.goal.current / Math.max(1, s.goal.target)) * 100))} />
          </div>
        ) : isLeader ? (
          <div className="flex flex-wrap items-end gap-2">
            <div className="flex-1 min-w-[180px]">
              <label className="text-xs text-muted-foreground">Title</label>
              <Input value={goalTitle} onChange={(e) => setGoalTitle(e.target.value)} placeholder="Crush 20 quests this week" />
            </div>
            <div className="w-24">
              <label className="text-xs text-muted-foreground">Target</label>
              <Input type="number" min={1} value={goalTarget} onChange={(e) => setGoalTarget(parseInt(e.target.value) || 1)} />
            </div>
            <Button onClick={() => goalTitle.trim() && s.setPartyGoal(goalTitle.trim(), goalTarget)}>Set goal</Button>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">No active goal — leader can set one.</p>
        )}
      </section>

      <section>
        <h2 className="mb-3 font-semibold">Members</h2>
        <div className="space-y-2">
          {s.members.map((m) => {
            const activeToday = m.last_active_date === todayIso;
            return (
              <div key={m.id} className="glass flex items-center justify-between rounded-xl p-3">
                <div className="flex items-center gap-3">
                  <div className={`h-2 w-2 rounded-full ${activeToday ? "bg-secondary shadow-[0_0_8px_hsl(var(--secondary))]" : "bg-muted"}`} />
                  <div>
                    <div className="flex items-center gap-1.5 text-sm font-medium">
                      {m.username}
                      {m.role === "leader" && <Crown className="h-3 w-3 text-yellow-400" />}
                      {m.user_id === user?.id && <span className="text-[10px] text-muted-foreground">(you)</span>}
                    </div>
                    <div className="text-[11px] text-muted-foreground">
                      {activeToday ? "Active today" : m.last_active_date ? `Last: ${m.last_active_date}` : "No activity yet"}
                    </div>
                  </div>
                </div>
                {isLeader && m.user_id !== user?.id && (
                  <Button size="icon" variant="ghost" onClick={() => s.kickMember(m.user_id)} aria-label="Remove">
                    <X className="h-4 w-4 text-destructive" />
                  </Button>
                )}
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}