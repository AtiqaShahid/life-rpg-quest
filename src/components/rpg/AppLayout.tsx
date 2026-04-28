import { ReactNode } from "react";
import { NavLink, Outlet } from "react-router-dom";
import { LayoutDashboard, Zap, Scroll, BarChart3, Trophy, Settings, LogOut, Gamepad2, Sparkles, ShoppingBag, Users, UserPlus, Medal, Shield, Brain, Flame, Network } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/context/AuthContext";
import { EarnXpBar } from "./EarnXpBar";
import { CurrencyBadges } from "./CurrencyBadges";
import { ClassOnboardingGate } from "./ClassOnboardingGate";

const NAV = [
  { to: "/app",              icon: LayoutDashboard, label: "Dashboard" },
  { to: "/app/activities",   icon: Zap,             label: "Activities" },
  { to: "/app/quests",       icon: Scroll,          label: "Quests" },
  { to: "/app/stats",        icon: BarChart3,       label: "Stats" },
  { to: "/app/analytics",    icon: Brain,           label: "Analytics" },
  { to: "/app/events",       icon: Flame,           label: "Events" },
  { to: "/app/depth",        icon: Network,         label: "Depth" },
  { to: "/app/skills",       icon: Sparkles,        label: "Skills" },
  { to: "/app/character",    icon: Shield,          label: "Character" },
  { to: "/app/achievements", icon: Trophy,          label: "Achievements" },
  { to: "/app/shop",         icon: ShoppingBag,     label: "Shop" },
  { to: "/app/party",        icon: Users,           label: "Party" },
  { to: "/app/friends",      icon: UserPlus,        label: "Friends" },
  { to: "/app/leaderboard",  icon: Medal,           label: "Ranks" },
  { to: "/app/settings",     icon: Settings,        label: "Settings" },
];

const linkClass = ({ isActive }: { isActive: boolean }) =>
  cn(
    "group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all",
    isActive
      ? "bg-gradient-primary text-primary-foreground shadow-glow-primary"
      : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
  );

const mobileLinkClass = ({ isActive }: { isActive: boolean }) =>
  cn(
    "flex flex-col items-center gap-1 rounded-xl px-2 py-1.5 text-[10px] font-medium transition-colors",
    isActive ? "text-primary" : "text-muted-foreground hover:text-foreground"
  );

export const AppLayout = ({ children }: { children?: ReactNode }) => {
  const { signOut, user } = useAuth();

  return (
    <div className="relative flex min-h-screen w-full">
      {/* Desktop sidebar — fixed, full viewport height, internal scroll only */}
      <aside className="hidden md:fixed md:inset-y-0 md:left-0 md:z-40 md:flex md:h-screen md:w-64 md:flex-col md:border-r md:border-border/50 md:bg-sidebar/60 md:backdrop-blur-xl">
        <div className="flex shrink-0 items-center gap-2.5 px-5 py-4">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-primary shadow-glow-primary">
            <Gamepad2 className="h-5 w-5 text-primary-foreground" />
          </div>
          <div>
            <div className="font-display text-base font-bold leading-none neon-text-primary">LIFE RPG</div>
            <div className="mt-0.5 font-mono text-[10px] tracking-widest text-secondary">v1.0 — beta</div>
          </div>
        </div>

        <nav className="flex-1 min-h-0 overflow-y-auto space-y-0.5 px-3 py-1">
          {NAV.map(({ to, icon: Icon, label }) => (
            <NavLink key={to} to={to} end={to === "/app"} className={linkClass}>
              <Icon className="h-4 w-4" />
              <span>{label}</span>
            </NavLink>
          ))}
        </nav>

        <div className="shrink-0 border-t border-border/50 p-2">
          <div className="mb-1 truncate px-3 font-mono text-[11px] text-muted-foreground">{user?.email}</div>
          <button
            onClick={() => signOut()}
            className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
          >
            <LogOut className="h-4 w-4" /> Sign out
          </button>
        </div>
      </aside>

      {/* Mobile top header */}
      <header className="fixed top-0 left-0 right-0 z-30 flex items-center justify-between border-b border-border/50 bg-background/70 px-4 py-3 backdrop-blur-xl md:hidden">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-primary shadow-glow-primary">
            <Gamepad2 className="h-4 w-4 text-primary-foreground" />
          </div>
          <span className="font-display text-sm font-bold neon-text-primary">LIFE RPG</span>
        </div>
        <div className="flex items-center gap-2">
          <CurrencyBadges />
          <button onClick={() => signOut()} aria-label="Sign out" className="rounded-lg p-1.5 text-muted-foreground hover:text-destructive">
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </header>

      {/* Main */}
      <main className="flex-1 overflow-y-auto px-4 pt-16 pb-44 sm:px-6 md:ml-64 md:px-8 md:pt-6 md:pb-32">
        <div className="mx-auto mb-4 hidden max-w-6xl justify-end md:flex">
          <CurrencyBadges />
        </div>
        <div className="mx-auto max-w-6xl animate-fade-in">
          {children ?? <Outlet />}
        </div>
      </main>

      {/* Mobile bottom nav */}
      <nav className="fixed bottom-0 left-0 right-0 z-50 border-t border-border/50 bg-background/90 backdrop-blur-xl md:hidden">
        <div className="grid grid-cols-7 gap-1 px-2 py-2 overflow-x-auto">
          {NAV.map(({ to, icon: Icon, label }) => (
            <NavLink key={to} to={to} end={to === "/app"} className={mobileLinkClass}>
              <Icon className="h-4 w-4" />
              <span>{label.slice(0, 6)}</span>
            </NavLink>
          ))}
        </div>
      </nav>

      {/* Always-visible Earn XP action bar */}
      <EarnXpBar />
      {/* First-time class selection gate */}
      <ClassOnboardingGate />
    </div>
  );
};
