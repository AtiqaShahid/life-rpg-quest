import { useMemo } from "react";
import { useActivitySession, formatRemaining } from "@/hooks/useActivitySession";
import { usePlayer } from "@/hooks/usePlayer";

export type FocusLockSource = "activity" | "quest";

export type FocusLockState =
  | { isLocked: false; source: null; title: null; endsAt: null; remainingMs: 0; isReady: false; sessionId: string | null }
  | {
      isLocked: true;
      source: FocusLockSource;
      title: string;
      endsAt: string;
      remainingMs: number;
      isReady: boolean;
      sessionId: string | null;
    };

/**
 * Unified global progression lock.
 *
 * If EITHER an activity session OR a timed quest is currently running, the
 * entire XP ecosystem enters a protected execution state. Only the active
 * source may be progressed; all other XP-producing actions are blocked.
 */
export function useFocusLock(): FocusLockState {
  const sess = useActivitySession();
  const player = usePlayer();
  const quest = player.activeTimedQuest;

  return useMemo<FocusLockState>(() => {
    // Activity session takes precedence (it's user-started and explicit).
    if (sess.session) {
      return {
        isLocked: true,
        source: "activity",
        title: sess.session.typeId,
        endsAt: sess.session.endsAt,
        remainingMs: sess.remainingMs,
        isReady: sess.isReady,
        sessionId: null,
      };
    }
    if (quest && quest.status === "in_progress" && quest.ends_at) {
      const ends = new Date(quest.ends_at).getTime();
      const remaining = Math.max(0, ends - Date.now());
      return {
        isLocked: true,
        source: "quest",
        title: quest.title,
        endsAt: quest.ends_at,
        remainingMs: remaining,
        isReady: remaining === 0,
        sessionId: quest.id,
      };
    }
    return { isLocked: false, source: null, title: null, endsAt: null, remainingMs: 0, isReady: false, sessionId: null };
  }, [sess.session, sess.remainingMs, sess.isReady, quest]);
}

export { formatRemaining };