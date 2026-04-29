import { useEffect, useMemo, useRef, useState } from "react";
import { useSocial, type UserSearchResult } from "@/hooks/useSocial";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Check, Clock, Search, UserMinus, UserPlus, Users, X } from "lucide-react";

function initials(name: string) {
  return name.slice(0, 2).toUpperCase();
}

export default function FriendsPage() {
  const s = useSocial();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<UserSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  const incoming = s.friends.filter((f) => f.direction === "incoming");
  const outgoing = s.friends.filter((f) => f.direction === "outgoing");
  const accepted = s.friends.filter((f) => f.direction === "friend");

  // Debounced live search
  useEffect(() => {
    const q = query.trim();
    if (!q) { setResults([]); setSearching(false); return; }
    setSearching(true);
    const t = setTimeout(async () => {
      const r = await s.searchUsers(q);
      setResults(r);
      setSearching(false);
    }, 300);
    return () => clearTimeout(t);
  }, [query, s]);

  // Close dropdown on outside click
  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  const handleAdd = async (username: string) => {
    await s.sendFriendRequest(username);
    // Refresh dropdown so the button state updates
    if (query.trim()) {
      const r = await s.searchUsers(query.trim());
      setResults(r);
    }
  };

  const friendCountLabel = useMemo(() => `${accepted.length} friend${accepted.length === 1 ? "" : "s"}`, [accepted.length]);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-display text-2xl font-bold neon-text-primary">Friends</h1>
        <p className="text-sm text-muted-foreground">Find players, send requests, and build your party.</p>
      </header>

      {/* Live search */}
      <div className="glass rounded-2xl p-5">
        <h2 className="mb-3 flex items-center gap-2 font-semibold">
          <Search className="h-4 w-4 text-primary" /> Find players
        </h2>
        <div ref={wrapRef} className="relative">
          <Input
            value={query}
            onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
            onFocus={() => setOpen(true)}
            placeholder="Search by username…"
            autoComplete="off"
          />
          {open && query.trim().length > 0 && (
            <div className="absolute left-0 right-0 top-full z-30 mt-2 max-h-80 overflow-auto rounded-xl border border-border/60 bg-popover/95 p-1 shadow-2xl backdrop-blur-xl">
              {searching && <div className="px-3 py-2 text-xs text-muted-foreground">Searching…</div>}
              {!searching && results.length === 0 && (
                <div className="px-3 py-3 text-sm text-muted-foreground">No players found for “{query}”.</div>
              )}
              {results.map((u) => (
                <div
                  key={u.user_id}
                  className="flex items-center justify-between gap-3 rounded-lg px-2 py-2 transition-colors hover:bg-accent/40"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <Avatar className="h-9 w-9 ring-1 ring-primary/40">
                      {u.avatar_url && <AvatarImage src={u.avatar_url} alt={u.username} />}
                      <AvatarFallback>{initials(u.username)}</AvatarFallback>
                    </Avatar>
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium">{u.username}</div>
                      <div className="text-[11px] text-muted-foreground">Lv {u.level}</div>
                    </div>
                  </div>
                  {u.friendship_status === "none" && (
                    <Button size="sm" onClick={() => handleAdd(u.username)}>
                      <UserPlus className="mr-1 h-3.5 w-3.5" /> Add
                    </Button>
                  )}
                  {u.friendship_status === "pending_outgoing" && (
                    <span className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Clock className="h-3.5 w-3.5" /> Pending
                    </span>
                  )}
                  {u.friendship_status === "pending_incoming" && (
                    <span className="text-xs text-secondary">Awaiting your reply</span>
                  )}
                  {u.friendship_status === "friend" && (
                    <span className="flex items-center gap-1 text-xs text-secondary">
                      <Check className="h-3.5 w-3.5" /> Friends
                    </span>
                  )}
                  {u.friendship_status === "blocked" && (
                    <span className="text-xs text-destructive">Blocked</span>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
        <p className="mt-2 text-[11px] text-muted-foreground">Type to search players. Suggestions update as you type.</p>
      </div>

      {/* Incoming */}
      {incoming.length > 0 && (
        <section>
          <h2 className="mb-2 font-semibold">Friend requests ({incoming.length})</h2>
          <div className="grid gap-2 sm:grid-cols-2">
            {incoming.map((f) => (
              <div key={f.id} className="glass flex flex-col gap-3 rounded-xl p-3">
                <div className="flex min-w-0 items-center gap-3">
                  <Avatar className="h-10 w-10 shrink-0 ring-1 ring-accent/50">
                    {f.other_avatar_url && <AvatarImage src={f.other_avatar_url} alt={f.other_username} />}
                    <AvatarFallback>{initials(f.other_username)}</AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">{f.other_username}</div>
                    <div className="text-[11px] text-muted-foreground">Lv {f.other_level} · wants to be friends</div>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button size="sm" className="flex-1" onClick={() => s.respondFriend(f.id, true)}>
                    <Check className="mr-1 h-4 w-4" /> Accept
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => s.respondFriend(f.id, false)}>
                    <X className="mr-1 h-4 w-4 text-destructive" /> Reject
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Outgoing */}
      {outgoing.length > 0 && (
        <section>
          <h2 className="mb-2 font-semibold">Pending sent ({outgoing.length})</h2>
          <div className="grid gap-2 sm:grid-cols-2">
            {outgoing.map((f) => (
              <div key={f.id} className="glass flex items-center justify-between gap-3 rounded-xl p-3">
                <div className="flex min-w-0 flex-1 items-center gap-3">
                  <Avatar className="h-9 w-9 shrink-0">
                    {f.other_avatar_url && <AvatarImage src={f.other_avatar_url} alt={f.other_username} />}
                    <AvatarFallback>{initials(f.other_username)}</AvatarFallback>
                  </Avatar>
                  <span className="truncate text-sm">{f.other_username}</span>
                </div>
                <span className="flex shrink-0 items-center gap-1 text-xs text-muted-foreground">
                  <Clock className="h-3.5 w-3.5" /> Awaiting
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Friends list */}
      <section>
        <h2 className="mb-2 flex items-center gap-2 font-semibold">
          <Users className="h-4 w-4 text-secondary" /> My friends ({friendCountLabel})
        </h2>
        {accepted.length === 0 ? (
          <div className="glass rounded-xl p-6 text-center text-sm text-muted-foreground">
            No friends yet — search above to send your first request.
          </div>
        ) : (
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {accepted.map((f) => (
              <div key={f.id} className="glass group flex items-center justify-between gap-3 rounded-xl p-3 transition-all hover:border-primary/40 hover:shadow-lg">
                <div className="flex min-w-0 flex-1 items-center gap-3">
                  <Avatar className="h-10 w-10 shrink-0 ring-1 ring-secondary/50">
                    {f.other_avatar_url && <AvatarImage src={f.other_avatar_url} alt={f.other_username} />}
                    <AvatarFallback>{initials(f.other_username)}</AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">{f.other_username}</div>
                    <div className="text-[11px] text-secondary">Lv {f.other_level} · Friend</div>
                  </div>
                </div>
                <Button size="icon" variant="ghost" className="shrink-0" onClick={() => s.removeFriend(f.other_user_id)} title="Remove friend">
                  <UserMinus className="h-4 w-4 text-destructive" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}