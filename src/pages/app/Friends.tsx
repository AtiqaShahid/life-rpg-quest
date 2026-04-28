import { useState } from "react";
import { useSocial } from "@/hooks/useSocial";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Check, UserMinus, UserPlus, X } from "lucide-react";

export default function FriendsPage() {
  const s = useSocial();
  const [name, setName] = useState("");

  const incoming = s.friends.filter((f) => f.direction === "incoming");
  const outgoing = s.friends.filter((f) => f.direction === "outgoing");
  const accepted = s.friends.filter((f) => f.direction === "friend");

  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-display text-2xl font-bold neon-text-primary">Friends</h1>
        <p className="text-sm text-muted-foreground">Add friends to compare progress on the friends leaderboard.</p>
      </header>

      <div className="glass rounded-2xl p-5">
        <h2 className="mb-2 font-semibold">Add by username</h2>
        <div className="flex gap-2">
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="username" />
          <Button onClick={() => name.trim() && (s.sendFriendRequest(name.trim()), setName(""))}>
            <UserPlus className="mr-1 h-4 w-4" /> Send
          </Button>
        </div>
      </div>

      {incoming.length > 0 && (
        <section>
          <h2 className="mb-2 font-semibold">Incoming requests</h2>
          <div className="space-y-2">
            {incoming.map((f) => (
              <div key={f.id} className="glass flex items-center justify-between rounded-xl p-3">
                <span className="text-sm">{f.other_username}</span>
                <div className="flex gap-1">
                  <Button size="icon" variant="ghost" onClick={() => s.respondFriend(f.id, true)}><Check className="h-4 w-4 text-secondary" /></Button>
                  <Button size="icon" variant="ghost" onClick={() => s.respondFriend(f.id, false)}><X className="h-4 w-4 text-destructive" /></Button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {outgoing.length > 0 && (
        <section>
          <h2 className="mb-2 font-semibold">Pending</h2>
          <div className="space-y-2">
            {outgoing.map((f) => (
              <div key={f.id} className="glass flex items-center justify-between rounded-xl p-3">
                <span className="text-sm">{f.other_username}</span>
                <span className="text-xs text-muted-foreground">Awaiting reply…</span>
              </div>
            ))}
          </div>
        </section>
      )}

      <section>
        <h2 className="mb-2 font-semibold">Friends ({accepted.length})</h2>
        {accepted.length === 0 ? (
          <p className="text-sm text-muted-foreground">No friends yet — send a request to get started.</p>
        ) : (
          <div className="space-y-2">
            {accepted.map((f) => (
              <div key={f.id} className="glass flex items-center justify-between rounded-xl p-3">
                <span className="text-sm">{f.other_username}</span>
                <Button size="icon" variant="ghost" onClick={() => s.removeFriend(f.other_user_id)}>
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