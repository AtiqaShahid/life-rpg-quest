import { Link } from "react-router-dom";
import { Gamepad2, Zap, Trophy, Flame, ChevronRight } from "lucide-react";
import heroAvatar from "@/assets/hero-avatar.png";
import { useAuth } from "@/context/AuthContext";

const features = [
  { icon: Zap,    title: "Real life → real XP", desc: "Log workouts, study sessions, meditation. Watch your character grow." },
  { icon: Trophy, title: "Quests & achievements", desc: "Daily quests reset every morning. Unlock badges as you level up." },
  { icon: Flame,  title: "Streaks that hit different", desc: "Show up daily. Your streak counter is on fire — literally." },
];

export default function Landing() {
  const { user } = useAuth();

  return (
    <div className="relative min-h-screen overflow-hidden">
      {/* Bg orbs */}
      <div className="pointer-events-none absolute -top-32 -right-20 h-[28rem] w-[28rem] rounded-full bg-primary/30 blur-3xl" />
      <div className="pointer-events-none absolute top-1/3 -left-32 h-[28rem] w-[28rem] rounded-full bg-secondary/20 blur-3xl" />
      <div className="pointer-events-none absolute bottom-0 left-1/3 h-[24rem] w-[24rem] rounded-full bg-accent/20 blur-3xl" />

      {/* Header */}
      <header className="relative mx-auto flex max-w-6xl items-center justify-between px-6 py-6">
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-primary shadow-glow-primary">
            <Gamepad2 className="h-5 w-5 text-primary-foreground" />
          </div>
          <span className="font-display text-lg font-bold neon-text-primary">LIFE RPG</span>
        </div>
        {user ? (
          <Link to="/app" className="rounded-full glass px-4 py-2 text-sm font-medium hover:shadow-glow-primary transition-all">
            Enter game
          </Link>
        ) : (
          <Link to="/auth" className="rounded-full glass px-4 py-2 text-sm font-medium hover:shadow-glow-primary transition-all">
            Sign in
          </Link>
        )}
      </header>

      {/* Hero */}
      <section className="relative mx-auto grid max-w-6xl items-center gap-10 px-6 py-12 lg:grid-cols-[1.2fr,1fr] lg:py-20">
        <div className="space-y-6 text-center lg:text-left">
          <div className="inline-flex items-center gap-2 rounded-full glass px-3 py-1.5 font-mono text-[11px] tracking-widest text-secondary">
            <span className="h-1.5 w-1.5 rounded-full bg-secondary animate-pulse" />
            REAL LIFE • LEVEL UP MODE
          </div>
          <h1 className="font-display text-4xl font-bold leading-[1.05] sm:text-5xl lg:text-6xl">
            Your life,
            <br />
            <span className="bg-gradient-cyber bg-clip-text text-transparent">but it&apos;s an RPG.</span>
          </h1>
          <p className="mx-auto max-w-xl text-base text-muted-foreground sm:text-lg lg:mx-0">
            Turn workouts, study, meditation, and habits into XP, levels, and stats.
            Show up every day. Build a character that mirrors who you&apos;re becoming.
          </p>
          <div className="flex flex-col items-center gap-3 sm:flex-row lg:justify-start">
            <Link
              to="/auth"
              className="group inline-flex items-center gap-2 rounded-full bg-gradient-primary px-6 py-3 font-display font-semibold text-primary-foreground shadow-glow-primary transition-all hover:scale-[1.03]"
            >
              Start your save file
              <ChevronRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
            </Link>
            <span className="font-mono text-xs tracking-wider text-muted-foreground">free • takes 30 sec</span>
          </div>
        </div>

        {/* Avatar showcase */}
        <div className="relative mx-auto w-full max-w-sm">
          <div className="absolute inset-0 -m-6 rounded-full bg-gradient-cyber opacity-40 blur-3xl animate-breathe" />
          <div className="relative glass-strong rounded-3xl p-6">
            <div className="relative mx-auto h-64 w-64 overflow-hidden rounded-2xl ring-1 ring-primary/40 shadow-glow-primary">
              <img src={heroAvatar} alt="Life RPG hero character" className="h-full w-full object-cover animate-breathe" width={512} height={512} />
              <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-background/90 to-transparent p-3">
                <div className="font-mono text-[10px] tracking-widest text-secondary">PLAYER</div>
                <div className="font-display font-bold">Lv 12 — Aria</div>
              </div>
            </div>
            <div className="mt-4 grid grid-cols-4 gap-2 text-center">
              {[
                { label: "INT", value: 38, color: "var(--stat-int)" },
                { label: "STR", value: 24, color: "var(--stat-str)" },
                { label: "DIS", value: 31, color: "var(--stat-dis)" },
                { label: "CHA", value: 19, color: "var(--stat-cha)" },
              ].map(s => (
                <div key={s.label} className="rounded-lg bg-muted/40 p-2">
                  <div className="font-mono text-[9px] tracking-widest text-muted-foreground">{s.label}</div>
                  <div className="font-display text-lg font-bold" style={{ color: `hsl(${s.color})` }}>{s.value}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="relative mx-auto max-w-6xl px-6 pb-24">
        <div className="grid gap-4 sm:grid-cols-3">
          {features.map(({ icon: Icon, title, desc }) => (
            <div key={title} className="glass rounded-2xl p-6 transition-all hover:-translate-y-1 hover:shadow-glow-primary">
              <div className="mb-3 inline-flex h-10 w-10 items-center justify-center rounded-xl bg-primary/15 text-primary ring-1 ring-primary/30">
                <Icon className="h-5 w-5" />
              </div>
              <h3 className="font-display text-lg font-semibold">{title}</h3>
              <p className="mt-1 text-sm text-muted-foreground">{desc}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
