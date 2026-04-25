import heroAvatar from "@/assets/hero-avatar.png";
import { useEffect, useState } from "react";
import { XpBar } from "./XpBar";
import { StatBadge } from "./StatBadge";
import { Profile, Stats, Streak } from "@/hooks/usePlayer";
import { Flame } from "lucide-react";
import { xpToNext } from "@/lib/rpg";

type Props = {
  profile: Profile;
  stats: Stats;
  streak: Streak;
  xpFlash: { amount: number; key: number } | null;
  levelUpFlash: { to: number; key: number } | null;
};

export const CharacterCard = ({ profile, stats, streak, xpFlash, levelUpFlash }: Props) => {
  const [showLevelUp, setShowLevelUp] = useState<number | null>(null);
  useEffect(() => {
    if (!levelUpFlash) return;
    setShowLevelUp(levelUpFlash.to);
    const t = setTimeout(() => setShowLevelUp(null), 1400);
    return () => clearTimeout(t);
  }, [levelUpFlash]);

  const avatarSrc = profile.avatar_url || heroAvatar;
  const needed = xpToNext(profile.level);

  return (
    <div className="glass-strong relative overflow-hidden rounded-3xl p-6 sm:p-8 animate-scale-in">
      {/* Soft warm decorative wash */}
      <div className="pointer-events-none absolute -top-20 -right-20 h-60 w-60 rounded-full bg-primary/10 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-24 -left-20 h-60 w-60 rounded-full bg-secondary/10 blur-3xl" />

      <div className="relative grid items-center gap-6 sm:grid-cols-[auto,1fr] sm:gap-8">
        {/* Avatar */}
        <div className="relative mx-auto sm:mx-0">
          <div className="absolute inset-0 -m-2 rounded-full bg-gradient-warm opacity-20 blur-xl" />
          <div className="relative h-40 w-40 sm:h-48 sm:w-48 overflow-hidden rounded-full ring-2 ring-primary/30 shadow-elegant animate-breathe">
            <img
              src={avatarSrc}
              alt={`${profile.username} character avatar`}
              className="h-full w-full object-cover"
              width={192}
              height={192}
            />
          </div>
          {/* Floating XP particles */}
          {xpFlash && (
            <div key={xpFlash.key} className="pointer-events-none absolute left-1/2 top-2 -translate-x-1/2 font-display text-2xl font-bold neon-text-cyan animate-xp-pop">
              +{xpFlash.amount} XP
            </div>
          )}
          {/* Level badge */}
          <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 rounded-full bg-gradient-primary px-4 py-1 font-display text-sm font-bold text-primary-foreground shadow-glow-primary">
            LV {profile.level}
          </div>
          {/* Level-up flash */}
          {showLevelUp != null && (
            <div className="pointer-events-none absolute inset-0 -m-8 rounded-full border-2 border-accent animate-level-up" />
          )}
        </div>

        {/* Info */}
        <div className="space-y-4 text-center sm:text-left">
          <div>
            <div className="font-mono text-xs tracking-[0.3em] text-secondary">PLAYER PROFILE</div>
            <h1 className="mt-1 font-display text-3xl font-bold neon-text-primary sm:text-4xl">{profile.username}</h1>
            <div className="mt-1 flex items-center justify-center gap-3 text-sm text-muted-foreground sm:justify-start">
              <span>Level <span className="font-semibold text-foreground">{profile.level}</span></span>
              <span className="opacity-40">•</span>
              <span className="inline-flex items-center gap-1.5">
                <Flame className="h-4 w-4 animate-flame text-accent" />
                <span className="font-semibold text-accent">{streak.current_streak}</span>
                <span>day streak</span>
              </span>
            </div>
          </div>

          <XpBar value={profile.xp} max={needed} />

          <div className="grid grid-cols-4 gap-2 sm:gap-3">
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
