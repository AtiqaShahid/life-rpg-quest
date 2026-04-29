import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/context/AuthContext";
import { toast } from "sonner";

export type DMType = "text" | "image";

export interface DirectMessage {
  id: string;
  sender_id: string;
  receiver_id: string;
  content: string;
  type: DMType;
  created_at: string;
  expires_at: string;
}

export function useChat(otherUserId: string | null) {
  const { user } = useAuth();
  const [messages, setMessages] = useState<DirectMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const seen = useRef<Set<string>>(new Set());

  const load = useCallback(async () => {
    if (!user || !otherUserId) return;
    setLoading(true);
    const { data, error } = await supabase.rpc("get_conversation", {
      p_other: otherUserId,
      p_limit: 200,
    });
    if (error) { toast.error(error.message); setLoading(false); return; }
    const rows = (data ?? []) as DirectMessage[];
    seen.current = new Set(rows.map((m) => m.id));
    setMessages(rows);
    setLoading(false);
  }, [user, otherUserId]);

  useEffect(() => { load(); }, [load]);

  // Drop expired messages locally
  useEffect(() => {
    const t = setInterval(() => {
      const now = Date.now();
      setMessages((prev) => prev.filter((m) => new Date(m.expires_at).getTime() > now));
    }, 30_000);
    return () => clearInterval(t);
  }, []);

  // Realtime: listen for new messages in either direction
  useEffect(() => {
    if (!user || !otherUserId) return;
    const ch = supabase
      .channel(`dm-${user.id}-${otherUserId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "direct_messages" },
        (payload) => {
          const m = payload.new as DirectMessage;
          const involvesPair =
            (m.sender_id === user.id && m.receiver_id === otherUserId) ||
            (m.sender_id === otherUserId && m.receiver_id === user.id);
          if (!involvesPair) return;
          if (seen.current.has(m.id)) return;
          seen.current.add(m.id);
          setMessages((prev) => [...prev, m]);
        },
      )
      .on(
        "postgres_changes",
        { event: "DELETE", schema: "public", table: "direct_messages" },
        (payload) => {
          const m = payload.old as { id?: string };
          if (!m?.id) return;
          seen.current.delete(m.id);
          setMessages((prev) => prev.filter((x) => x.id !== m.id));
        },
      )
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [user, otherUserId]);

  const sendText = useCallback(async (text: string) => {
    if (!user || !otherUserId) return;
    const trimmed = text.trim();
    if (!trimmed) return;
    setSending(true);
    const { data, error } = await supabase.rpc("send_direct_message", {
      p_receiver: otherUserId,
      p_content: trimmed,
      p_type: "text",
    });
    setSending(false);
    if (error) return toast.error(error.message);
    const r = data as { ok: boolean; reason?: string };
    if (!r?.ok) return toast.error(r?.reason ?? "Could not send");
  }, [user, otherUserId]);

  const sendImage = useCallback(async (file: File) => {
    if (!user || !otherUserId) return;
    if (!file.type.startsWith("image/")) return toast.error("Please select an image");
    if (file.size > 5 * 1024 * 1024) return toast.error("Image must be under 5MB");
    setSending(true);
    try {
      const ext = file.name.split(".").pop()?.toLowerCase() ?? "png";
      const path = `${user.id}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from("chat-images").upload(path, file, { contentType: file.type, upsert: false });
      if (upErr) throw upErr;
      const { data: pub } = supabase.storage.from("chat-images").getPublicUrl(path);
      const url = pub.publicUrl;
      const { data, error } = await supabase.rpc("send_direct_message", {
        p_receiver: otherUserId,
        p_content: url,
        p_type: "image",
      });
      if (error) throw error;
      const r = data as { ok: boolean; reason?: string };
      if (!r?.ok) throw new Error(r?.reason ?? "Could not send image");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Image upload failed");
    } finally {
      setSending(false);
    }
  }, [user, otherUserId]);

  return { messages, loading, sending, sendText, sendImage, reload: load };
}