import { useEffect, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import { Bot, Send, Sparkles, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { usePlayer } from "@/hooks/usePlayer";

type Msg = { role: "user" | "assistant"; content: string };

const ROUTE_LABELS: Record<string, string> = {
  "/app": "Dashboard",
  "/app/activities": "Activities",
  "/app/quests": "Quest Board",
  "/app/stats": "Stats",
  "/app/analytics": "Analytics",
  "/app/events": "Events",
  "/app/depth": "Depth",
  "/app/skills": "Skills",
  "/app/character": "Character",
  "/app/achievements": "Achievements",
  "/app/shop": "Shop",
  "/app/party": "Party",
  "/app/friends": "Friends",
  "/app/leaderboard": "Leaderboard",
  "/app/settings": "Settings",
};

const QUICK_PROMPTS = [
  "How do quests work?",
  "Why is my quest timed?",
  "How does XP & leveling work?",
  "What's on this page?",
];

export function AIGuide() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const location = useLocation();

  // Pull live player state for context
  let playerCtx: ReturnType<typeof usePlayer> | null = null;
  try { playerCtx = usePlayer(); } catch { playerCtx = null; }

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, busy]);

  const buildContext = () => {
    const route = location.pathname;
    const ctx: Record<string, unknown> = {
      current_page: ROUTE_LABELS[route] ?? route,
      route,
    };
    if (playerCtx?.profile) {
      ctx.level = playerCtx.profile.level;
      ctx.xp = playerCtx.profile.xp;
      ctx.xp_to_next = playerCtx.xpNeeded;
      const econ = playerCtx.profile as unknown as { coins?: number; tokens?: number };
      if (econ.coins !== undefined) ctx.coins = econ.coins;
      if (econ.tokens !== undefined) ctx.tokens = econ.tokens;
    }
    if (playerCtx?.streak) ctx.current_streak = playerCtx.streak.current_streak;
    if (playerCtx?.stats) ctx.stats = {
      INT: playerCtx.stats.intelligence, STR: playerCtx.stats.strength,
      DIS: playerCtx.stats.discipline, CHA: playerCtx.stats.charisma,
    };
    if (playerCtx?.quests) {
      const all = playerCtx.quests as unknown as Array<{ title: string; completed: boolean; status?: string; quest_type?: string }>;
      const active = all.filter(q => !q.completed && q.status !== "completed");
      ctx.daily_quests = active.filter(q => q.quest_type === "daily").map(q => q.title);
      ctx.weekly_quests = active.filter(q => q.quest_type === "weekly").map(q => q.title);
    }
    if (playerCtx?.activeTimedQuest) {
      ctx.active_timed_quest = {
        title: playerCtx.activeTimedQuest.title,
        ends_at: playerCtx.activeTimedQuest.ends_at,
      };
    }
    return ctx;
  };

  const send = async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || busy) return;
    const userMsg: Msg = { role: "user", content: trimmed };
    const next = [...messages, userMsg];
    setMessages(next);
    setInput("");
    setBusy(true);

    let assistantText = "";
    const pushAssistant = (chunk: string) => {
      assistantText += chunk;
      setMessages(prev => {
        const last = prev[prev.length - 1];
        if (last?.role === "assistant") {
          return prev.map((m, i) => i === prev.length - 1 ? { ...m, content: assistantText } : m);
        }
        return [...prev, { role: "assistant", content: assistantText }];
      });
    };

    try {
      const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ai-guide`;
      const resp = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
        },
        body: JSON.stringify({ messages: next, context: buildContext() }),
      });
      if (!resp.ok || !resp.body) {
        const errJson = await resp.json().catch(() => ({}));
        pushAssistant(errJson?.error ?? "Something went wrong. Try again.");
        setBusy(false);
        return;
      }
      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      let done = false;
      while (!done) {
        const { done: d, value } = await reader.read();
        if (d) break;
        buf += decoder.decode(value, { stream: true });
        let idx: number;
        while ((idx = buf.indexOf("\n")) !== -1) {
          let line = buf.slice(0, idx);
          buf = buf.slice(idx + 1);
          if (line.endsWith("\r")) line = line.slice(0, -1);
          if (!line || line.startsWith(":")) continue;
          if (!line.startsWith("data: ")) continue;
          const payload = line.slice(6).trim();
          if (payload === "[DONE]") { done = true; break; }
          try {
            const parsed = JSON.parse(payload);
            const c = parsed.choices?.[0]?.delta?.content as string | undefined;
            if (c) pushAssistant(c);
          } catch {
            buf = line + "\n" + buf;
            break;
          }
        }
      }
    } catch (e) {
      pushAssistant("Connection error. Check your network and try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      {/* Floating launcher */}
      <button
        aria-label="Open AI guide"
        onClick={() => setOpen(o => !o)}
        className={cn(
          "fixed bottom-28 right-4 z-[60] flex h-14 w-14 items-center justify-center rounded-full",
          "bg-gradient-primary shadow-glow-primary transition-transform hover:scale-110 md:bottom-6 md:right-6",
          open && "scale-95"
        )}
      >
        {open ? <X className="h-6 w-6 text-primary-foreground" /> : <Bot className="h-6 w-6 text-primary-foreground" />}
      </button>

      {/* Panel */}
      {open && (
        <div className="fixed bottom-44 right-4 z-[60] flex h-[min(560px,calc(100vh-12rem))] w-[min(380px,calc(100vw-2rem))] flex-col overflow-hidden rounded-2xl border border-border/60 bg-background/95 shadow-2xl backdrop-blur-xl md:bottom-24 md:right-6">
          {/* Header */}
          <div className="flex items-center gap-3 border-b border-border/50 bg-gradient-primary/10 px-4 py-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-primary shadow-glow-primary">
              <Sparkles className="h-4 w-4 text-primary-foreground" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="font-display text-sm font-bold neon-text-primary">AURA</div>
              <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Your in-game guide</div>
            </div>
          </div>

          {/* Messages */}
          <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto px-3 py-3">
            {messages.length === 0 && (
              <div className="space-y-3">
                <div className="rounded-xl border border-border/60 bg-muted/40 p-3 text-xs text-muted-foreground">
                  Hi Player. I know every system in this app — quests, XP, timers, stats, classes, streaks. Ask me anything, or tap a suggestion below.
                </div>
                <div className="grid gap-2">
                  {QUICK_PROMPTS.map(q => (
                    <button
                      key={q}
                      onClick={() => send(q)}
                      className="rounded-lg border border-border/60 bg-card/40 px-3 py-2 text-left text-xs text-foreground transition-colors hover:border-primary/60 hover:bg-primary/10"
                    >
                      {q}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {messages.map((m, i) => (
              <div key={i} className={cn("flex", m.role === "user" ? "justify-end" : "justify-start")}>
                <div
                  className={cn(
                    "max-w-[85%] whitespace-pre-wrap break-words rounded-2xl px-3 py-2 text-sm",
                    m.role === "user"
                      ? "bg-primary/90 text-primary-foreground rounded-br-sm"
                      : "bg-muted text-foreground rounded-bl-sm"
                  )}
                >
                  {m.content || (busy && i === messages.length - 1 ? "…" : "")}
                </div>
              </div>
            ))}
            {busy && messages[messages.length - 1]?.role === "user" && (
              <div className="flex justify-start">
                <div className="rounded-2xl rounded-bl-sm bg-muted px-3 py-2 text-sm text-muted-foreground">…</div>
              </div>
            )}
          </div>

          {/* Composer */}
          <div className="border-t border-border/50 bg-background/80 p-2">
            <div className="flex gap-2">
              <Input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Ask AURA…"
                disabled={busy}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    send(input);
                  }
                }}
              />
              <Button size="icon" onClick={() => send(input)} disabled={busy || !input.trim()}>
                <Send className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}