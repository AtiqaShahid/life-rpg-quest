import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/context/AuthContext";

export type EventScope = "weekly" | "seasonal" | "global";
export type ParticipationStatus = "not_joined" | "active" | "completed" | "expired" | "claimed";

export type EventCard = {
  id: string;
  template_id: string | null;
  scope: EventScope;
  status: "active" | "upcoming" | "completed" | "expired";
  title: string;
  tagline: string;
  flavor: string | null;
  category: string;
  multiplier: number;
  reward_xp: number;
  reward_coins: number;
  reward_tokens: number;
  reward_item_ids: string[];
  global_target: number | null;
  global_progress: number;
  starts_at: string;
  ends_at: string;
  progress: number;
  target: number;
  part_status: ParticipationStatus;
  claimed_at: string | null;
};

export type EventHistoryRow = {
  id: string; title: string; scope: EventScope; outcome: ParticipationStatus;
  progress: number; target: number; awarded_xp: number; awarded_coins: number;
  awarded_tokens: number; awarded_items: string[]; ended_at: string;
};

export type InventoryItem = {
  reward_id: string; name: string; description: string; icon: string;
  kind: string; rarity: string; effect: Record<string, unknown>;
  acquired_at: string;
};

export type EventDashboard = {
  active: EventCard[];
  seasonal: EventCard[];
  global: EventCard[];
  history: EventHistoryRow[];
  inventory: InventoryItem[];
  aggregate_multiplier: number;
  computed_at: string;
};

export function useEvents() {
  const { user } = useAuth();
  const [data, setData] = useState<EventDashboard | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const flavoredRef = useRef<Set<string>>(new Set());

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    const { data: res, error } = await supabase.rpc("get_event_dashboard" as never);
    setLoading(false);
    if (error) { setError(error.message); return; }
    const d = res as unknown as EventDashboard;
    setData(d);

    // Background AI flavor pass for newly seen events (best-effort, non-blocking).
    const fresh = [...d.active, ...d.seasonal, ...d.global].filter(
      e => e.template_id && !flavoredRef.current.has(e.id)
    ).map(e => ({ id: e.id, title: e.title, tagline: e.tagline, category: e.category, scope: e.scope }));
    if (fresh.length > 0) {
      fresh.forEach(e => flavoredRef.current.add(e.id));
      supabase.functions.invoke("event-flavor", { body: { events: fresh } }).then(({ data: fr }) => {
        const items = (fr as { items?: { id: string; title: string; tagline: string }[] } | null)?.items;
        if (!items?.length) return;
        setData(prev => {
          if (!prev) return prev;
          const map = new Map(items.map(i => [i.id, i]));
          const apply = (arr: EventCard[]) => arr.map(c => map.has(c.id)
            ? { ...c, title: map.get(c.id)!.title, tagline: map.get(c.id)!.tagline } : c);
          return { ...prev, active: apply(prev.active), seasonal: apply(prev.seasonal), global: apply(prev.global) };
        });
      }).catch(() => {});
    }
  }, [user]);

  useEffect(() => { load(); }, [load]);

  // Realtime: refresh on event/participation changes for this user
  useEffect(() => {
    if (!user) return;
    const ch = supabase.channel(`events_${user.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "event_participation", filter: `user_id=eq.${user.id}` }, () => load())
      .on("postgres_changes", { event: "*", schema: "public", table: "events" }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [user, load]);

  const join = useCallback(async (eventId: string) => {
    const { error } = await supabase.rpc("join_event" as never, { p_event: eventId } as never);
    if (error) throw error;
    await load();
  }, [load]);

  const claim = useCallback(async (eventId: string) => {
    const { data: res, error } = await supabase.rpc("claim_event_rewards" as never, { p_event: eventId } as never);
    if (error) throw error;
    await load();
    return res as { xp: number; coins: number; tokens: number; items: string[] };
  }, [load]);

  return { data, loading, error, refresh: load, join, claim };
}

export function formatTimeLeft(iso: string): string {
  const ms = new Date(iso).getTime() - Date.now();
  if (ms <= 0) return "Ended";
  const s = Math.floor(ms / 1000);
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m`;
  return `${s}s`;
}