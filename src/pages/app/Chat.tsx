import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useSocial } from "@/hooks/useSocial";
import { useAuth } from "@/context/AuthContext";
import { useChat } from "@/hooks/useChat";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ArrowLeft, Check, CheckCheck, Image as ImageIcon, Send, X } from "lucide-react";

function initials(name: string) { return name.slice(0, 2).toUpperCase(); }
function formatTime(iso: string) {
  const d = new Date(iso);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}
function timeLeft(iso: string) {
  const ms = new Date(iso).getTime() - Date.now();
  if (ms <= 0) return "expired";
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

export default function ChatPage() {
  const { friendId } = useParams<{ friendId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { friends, loading: socialLoading } = useSocial();
  const friend = useMemo(
    () => friends.find((f) => f.other_user_id === friendId && f.direction === "friend"),
    [friends, friendId],
  );

  const [tabVisible, setTabVisible] = useState<boolean>(
    typeof document === "undefined" ? true : document.visibilityState === "visible",
  );
  useEffect(() => {
    const onVis = () => setTabVisible(document.visibilityState === "visible");
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, []);

  const { messages, loading, sending, sendText, sendImage } = useChat(
    friend?.other_user_id ?? null,
    { active: tabVisible },
  );
  const [text, setText] = useState("");
  const [preview, setPreview] = useState<{ file: File; url: string } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  // Friend-only access guard
  if (!socialLoading && !friend) {
    return (
      <div className="space-y-4">
        <Button variant="ghost" onClick={() => navigate("/app/friends")}>
          <ArrowLeft className="mr-1 h-4 w-4" /> Back to friends
        </Button>
        <div className="glass rounded-2xl p-8 text-center">
          <p className="text-sm text-muted-foreground">You can only chat with mutual friends.</p>
        </div>
      </div>
    );
  }

  const handlePick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) return;
    setPreview({ file, url: URL.createObjectURL(file) });
  };

  const handleSend = async () => {
    if (preview) {
      await sendImage(preview.file);
      URL.revokeObjectURL(preview.url);
      setPreview(null);
    }
    if (text.trim()) {
      await sendText(text);
      setText("");
    }
  };

  return (
    <div className="flex h-[calc(100vh-8rem)] flex-col gap-3">
      {/* Header */}
      <div className="glass flex items-center gap-3 rounded-2xl p-3">
        <Button size="icon" variant="ghost" onClick={() => navigate("/app/friends")}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <Avatar className="h-10 w-10 ring-1 ring-secondary/50">
          {friend?.other_avatar_url && <AvatarImage src={resolveAvatarUrl(friend.other_avatar_url) ?? undefined} alt={friend.other_username} />}
          <AvatarFallback>{initials(friend?.other_username ?? "?")}</AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold">{friend?.other_username ?? "…"}</div>
          <div className="text-[11px] text-muted-foreground">Messages disappear after 24h</div>
        </div>
      </div>

      {/* Messages */}
      <div className="glass flex-1 overflow-y-auto rounded-2xl p-4">
        {loading && <p className="text-center text-xs text-muted-foreground">Loading…</p>}
        {!loading && messages.length === 0 && (
          <p className="text-center text-xs text-muted-foreground">No messages yet — say hi 👋</p>
        )}
        <div className="space-y-2">
          {messages.map((m) => {
            const mine = m.sender_id === user?.id;
            return (
              <div key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                <div
                  className={`max-w-[78%] rounded-2xl px-3 py-2 text-sm shadow-md transition-all ${
                    mine
                      ? "bg-primary/90 text-primary-foreground rounded-br-sm"
                      : "bg-muted text-foreground rounded-bl-sm"
                  }`}
                >
                  {m.type === "image" ? (
                    <a href={m.content} target="_blank" rel="noreferrer">
                      <img
                        src={m.content}
                        alt="sent"
                        className="max-h-64 rounded-lg object-cover"
                        loading="lazy"
                      />
                    </a>
                  ) : (
                    <p className="whitespace-pre-wrap break-words">{m.content}</p>
                  )}
                  <div className={`mt-1 flex items-center gap-2 text-[10px] ${mine ? "text-primary-foreground/70" : "text-muted-foreground"}`}>
                    <span>{formatTime(m.created_at)}</span>
                    <span>· {timeLeft(m.expires_at)} left</span>
                    {mine && (
                      <span className="ml-1 inline-flex items-center" title={m.status}>
                        {m.status === "sent" && <Check className="h-3 w-3" />}
                        {m.status === "delivered" && <CheckCheck className="h-3 w-3 opacity-70" />}
                        {m.status === "seen" && <CheckCheck className="h-3 w-3 text-secondary" />}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
          <div ref={bottomRef} />
        </div>
      </div>

      {/* Composer */}
      <div className="glass rounded-2xl p-3">
        {preview && (
          <div className="mb-2 flex items-center gap-2 rounded-lg border border-border/60 p-2">
            <img src={preview.url} alt="preview" className="h-14 w-14 rounded object-cover" />
            <span className="flex-1 truncate text-xs text-muted-foreground">{preview.file.name}</span>
            <Button
              size="icon"
              variant="ghost"
              onClick={() => { URL.revokeObjectURL(preview.url); setPreview(null); }}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        )}
        <div className="flex gap-2">
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handlePick}
          />
          <Button
            size="icon"
            variant="ghost"
            onClick={() => fileRef.current?.click()}
            disabled={sending}
            title="Attach image"
          >
            <ImageIcon className="h-4 w-4" />
          </Button>
          <Input
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Type a message…"
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
            disabled={sending}
          />
          <Button onClick={handleSend} disabled={sending || (!text.trim() && !preview)}>
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}