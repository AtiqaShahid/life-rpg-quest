import heroAvatar from "@/assets/hero-avatar.png";
import { useEffect, useState } from "react";
import { XpBar } from "./XpBar";
import { StatBadge } from "./StatBadge";
import { Profile, Stats, Streak } from "@/hooks/usePlayer";
import { Flame, Sparkles } from "lucide-react";
import { xpToNext } from "@/lib/rpg";
import { useUnreadMessages } from "@/hooks/useUnreadMessages";
import { Link } from "react-router-dom";

type Props = {
  profile: Profile;
  stats: Stats;
  streak: Streak;
  xpFlash: { amount: number; key: number } | null;
  levelUpFlash: { to: number; key: number } | null;
};

export const CharacterCard = ({ profile, stats, streak, xpFlash, levelUpFlash }: Props) => {
  const [showLevelUp, setShowLevelUp] = useState<number | null>(null);
  const { total: unread } = useUnreadMessages();
  useEffect(() => {
    if (!levelUpFlash) return;
    setShowLevelUp(levelUpFlash.to);
    const t = setTimeout(() => setShowLevelUp(null), 1400);
    return () => clearTimeout(t);
  }, [levelUpFlash]);

  // Resolve avatar with localStorage cache so it renders instantly on reload,
  // and gracefully fall back to bundled hero asset if the remote URL fails.
  const cacheKey = `avatar_url:${profile.user_id}`;
  const cached = typeof window !== "undefined" ? window.localStorage.getItem(cacheKey) : null;
  const initial = profile.avatar_url || cached || heroAvatar;
  const [avatarSrc, setAvatarSrc] = useState<string>(initial);

  useEffect(() => {
    const next = profile.avatar_url || cached || heroAvatar;
    setAvatarSrc(next);
    if (profile.avatar_url) {
      try { window.localStorage.setItem(cacheKey, profile.avatar_url); } catch { /* ignore */ }
    }
  }, [profile.avatar_url, cached, cacheKey]);

  const needed = xpToNext(profile.level);

  return (
    <div className="glass-strong relative overflow-hidden rounded-3xl p-4 sm:p-6 md:p-8 animate-scale-in">
      {/* Decorative orbits */}
      <div className="pointer-events-none absolute -top-20 -right-20 h-60 w-60 rounded-full bg-primary/20 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-24 -left-20 h-60 w-60 rounded-full bg-secondary/20 blur-3xl" />
      <div className="pointer-events-none absolute inset-0 opacity-40" style={{ background: "radial-gradient(circle at 30% 30%, hsl(var(--accent) / 0.08), transparent 60%)" }} />

      <div className="relative grid items-center gap-5 md:grid-cols-[auto,1fr] md:gap-8">
        {/* Avatar */}
        <div className="relative mx-auto sm:mx-0">
          <div className="absolute inset-0 -m-3 rounded-full bg-gradient-cyber opacity-50 blur-2xl animate-breathe" />
          <div className="absolute inset-0 -m-1 rounded-full bg-gradient-cool opacity-70 blur" />
          <div className="relative h-28 w-28 sm:h-36 sm:w-36 md:h-44 md:w-44 lg:h-48 lg:w-48 overflow-hidden rounded-full ring-2 ring-primary/60 shadow-glow-primary animate-breathe">
            <img
              src={avatarSrc}
              alt={`${profile.username} character avatar`}
              className="h-full w-full object-cover"
              width={192}
              height={192}
              loading="eager"
              decoding="async"
              onError={() => {
                if (avatarSrc !== heroAvatar) setAvatarSrc(heroAvatar);
              }}
            />
          </div>
          {/* Floating XP particles */}
          {xpFlash && (
            <div key={xpFlash.key} className="pointer-events-none absolute left-1/2 top-2 -translate-x-1/2 font-display text-2xl font-bold neon-text-cyan animate-xp-pop">
              +{xpFlash.amount} XP
            </div>
          )}
          {/* Level badge */}
          <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-gradient-primary px-3 py-0.5 font-display text-xs sm:text-sm font-bold text-primary-foreground shadow-glow-primary">
            LV {profile.level}
          </div>
          {/* Unread messages badge */}
          {unread > 0 && (
            <Link
              to="/app/friends"
              title={`${unread} unread message${unread === 1 ? "" : "s"}`}
              className="absolute right-0 top-0 z-10 flex h-7 min-w-[1.75rem] items-center justify-center rounded-full bg-emerald-500 px-1.5 font-display text-[11px] font-bold text-white shadow-[0_0_12px_hsl(142_76%_45%/0.7)] ring-2 ring-background animate-pulse hover:scale-110 transition-transform"
            >
              {unread > 9 ? "9+" : unread}
            </Link>
          )}
          {/* Level-up flash */}
          {showLevelUp != null && (
            <div className="pointer-events-none absolute inset-0 -m-8 rounded-full border-2 border-accent animate-level-up" />
          )}
        </div>

        {/* Info */}
        <div className="min-w-0 space-y-3 text-center md:space-y-4 md:text-left">
          <div>
            <div className="font-mono text-[10px] sm:text-xs tracking-[0.3em] text-secondary">PLAYER PROFILE</div>
            <h1 className="mt-1 truncate font-display text-2xl sm:text-3xl md:text-4xl font-bold neon-text-primary">{profile.username}</h1>
            <div className="mt-1 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-xs sm:text-sm text-muted-foreground md:justify-start">
              <span>Level <span className="font-semibold text-foreground">{profile.level}</span></span>
              <span className="opacity-40">•</span>
              <span className="inline-flex items-center gap-1.5">
                <Flame className="h-4 w-4 animate-flame text-accent" />
                <span className="font-semibold text-accent">{streak.current_streak}</span>
                <span>day{streak.current_streak === 1 ? "" : "s"}</span>
              </span>
              {profile.skill_points > 0 && (
                <>
                  <span className="opacity-40">•</span>
                  <span className="inline-flex items-center gap-1.5">
                    <Sparkles className="h-4 w-4 text-primary" />
                    <span className="font-semibold text-primary">{profile.skill_points}</span>
                    <span>SP</span>
                  </span>
                </>
              )}
            </div>
          </div>

          <XpBar value={profile.xp} max={needed} />

          <div className="grid grid-cols-4 gap-1.5 sm:gap-2 md:gap-3">
            <StatBadge stat="intelligence" value={stats.intelligence} />
            <StatBadge stat="strength" value={stats.strength} />
            <StatBadge stat="discipline" value={stats.discipline} />
            <StatBadge stat="charisma" value={stats.charisma} />
          </div>
        </div>
      </div>
    </div>
  );
};
