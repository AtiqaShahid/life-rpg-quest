import { createContext, createElement, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/context/AuthContext";

interface UnreadContextValue {
  total: number;
  byFriend: Record<string, number>;
  refresh: () => Promise<void>;
}

const UnreadContext = createContext<UnreadContextValue | null>(null);

export function UnreadMessagesProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [byFriend, setByFriend] = useState<Record<string, number>>({});

  const refresh = useCallback(async () => {
    if (!user) { setByFriend({}); return; }
    const { data, error } = await supabase
      .from("direct_messages")
      .select("sender_id, status, expires_at, receiver_id")
      .eq("receiver_id", user.id)
      .neq("status", "seen");
    if (error) return;
    const now = Date.now();
    const map: Record<string, number> = {};
    (data ?? []).forEach((m) => {
      if (new Date(m.expires_at as string).getTime() <= now) return;
      map[m.sender_id as string] = (map[m.sender_id as string] ?? 0) + 1;
    });
    setByFriend(map);
  }, [user]);

  useEffect(() => { refresh(); }, [refresh]);

  // Realtime: any change to direct_messages affecting this user → refresh
  useEffect(() => {
    if (!user) return;
    const ch = supabase
      .channel(`unread-${user.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "direct_messages" },
        (payload) => {
          const row = (payload.new ?? payload.old) as { receiver_id?: string } | null;
          if (!row || row.receiver_id !== user.id) return;
          refresh();
        },
      )
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [user, refresh]);

  // Periodic prune so expired messages drop from count even without DB events
  useEffect(() => {
    const t = setInterval(refresh, 60_000);
    return () => clearInterval(t);
  }, [refresh]);

  const total = Object.values(byFriend).reduce((a, b) => a + b, 0);
  const value: UnreadContextValue = { total, byFriend, refresh };
  return createElement(UnreadContext.Provider, { value }, children);
}

export function useUnreadMessages(): UnreadContextValue {
  const ctx = useContext(UnreadContext);
  if (!ctx) return { total: 0, byFriend: {}, refresh: async () => {} };
  return ctx;
}