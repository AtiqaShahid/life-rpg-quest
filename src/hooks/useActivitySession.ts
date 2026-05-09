import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import type { Difficulty } from "@/lib/progression";

export type ActivitySession = {
  typeId: string;
  subtype: string;
  duration: number; // minutes
  difficulty: Difficulty;
  note?: string;
  startedAt: string;
  endsAt: string;
};

const KEY = (uid: string) => `activity_session:${uid}`;

export function readActivitySession(uid: string | undefined): ActivitySession | null {
  if (!uid || typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(KEY(uid));
    return raw ? (JSON.parse(raw) as ActivitySession) : null;
  } catch {
    return null;
  }
}

export function useActivitySession() {
  const { user } = useAuth();
  const uid = user?.id;
  const [session, setSession] = useState<ActivitySession | null>(() => readActivitySession(uid));
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    setSession(readActivitySession(uid));
  }, [uid]);

  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    const onStorage = (e: StorageEvent) => {
      if (uid && e.key === KEY(uid)) setSession(readActivitySession(uid));
    };
    window.addEventListener("storage", onStorage);
    return () => {
      window.clearInterval(t);
      window.removeEventListener("storage", onStorage);
    };
  }, [uid]);

  const startSession = useCallback(
    (s: Omit<ActivitySession, "startedAt" | "endsAt">): { ok: boolean; reason?: string } => {
      if (!uid) return { ok: false, reason: "not_authenticated" };
      const existing = readActivitySession(uid);
      if (existing && new Date(existing.endsAt).getTime() > Date.now()) {
        return { ok: false, reason: "session_active" };
      }
      const startedAt = new Date();
      const endsAt = new Date(startedAt.getTime() + s.duration * 60_000);
      const next: ActivitySession = {
        ...s,
        startedAt: startedAt.toISOString(),
        endsAt: endsAt.toISOString(),
      };
      window.localStorage.setItem(KEY(uid), JSON.stringify(next));
      setSession(next);
      return { ok: true };
    },
    [uid],
  );

  const clearSession = useCallback(() => {
    if (!uid) return;
    window.localStorage.removeItem(KEY(uid));
    setSession(null);
  }, [uid]);

  const endsAtMs = session ? new Date(session.endsAt).getTime() : 0;
  const startedAtMs = session ? new Date(session.startedAt).getTime() : 0;
  const totalMs = session ? session.duration * 60_000 : 0;
  const remainingMs = session ? Math.max(0, endsAtMs - now) : 0;
  const elapsedMs = session ? Math.min(totalMs, Math.max(0, now - startedAtMs)) : 0;
  const isReady = !!session && remainingMs === 0;
  const isActive = !!session && remainingMs > 0;

  return { session, remainingMs, elapsedMs, totalMs, isReady, isActive, startSession, clearSession };
}

export function formatRemaining(ms: number): string {
  const total = Math.ceil(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}