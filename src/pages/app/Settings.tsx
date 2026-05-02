import { useRef, useState } from "react";
import { usePlayer } from "@/hooks/usePlayer";
import { useAuth } from "@/context/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, Settings as Cog, Upload } from "lucide-react";
import heroAvatar from "@/assets/hero-avatar.png";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { DEFAULT_AVATARS, resolveAvatarUrl } from "@/lib/defaultAvatars";
import { cn } from "@/lib/utils";

export default function Settings() {
  const p = usePlayer();
  const { user, signOut } = useAuth();
  const [username, setUsername] = useState("");
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const [galleryOpen, setGalleryOpen] = useState(false);
  const [savingAvatar, setSavingAvatar] = useState<string | null>(null);

  if (p.loading || !p.profile) return <div className="flex h-[60vh] items-center justify-center text-muted-foreground"><Loader2 className="mr-2 h-5 w-5 animate-spin" /> Loading…</div>;

  const onUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f || !user) return;
    setBusy(true);
    try {
      const ext = f.name.split(".").pop();
      const path = `${user.id}/avatar-${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage.from("avatars").upload(path, f, { upsert: true });
      if (upErr) throw upErr;
      const { data: pub } = supabase.storage.from("avatars").getPublicUrl(path);
      await p.updateProfile({ avatar_url: pub.publicUrl });
      toast.success("Avatar updated");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed");
    } finally { setBusy(false); }
  };

  const saveName = async () => {
    if (!username.trim()) return;
    await p.updateProfile({ username: username.trim() });
    setUsername(""); toast.success("Username updated");
  };

  const pickDefaultAvatar = async (id: string) => {
    setSavingAvatar(id);
    try {
      // Persist a stable token, NOT the hashed asset URL (which changes on each build).
      await p.updateProfile({ avatar_url: `default:${id}` });
      toast.success("Avatar updated");
      setGalleryOpen(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to set avatar");
    } finally {
      setSavingAvatar(null);
    }
  };

  return (
    <div className="space-y-8">
      <header>
        <div className="flex items-center gap-2 font-mono text-[11px] tracking-widest text-secondary"><Cog className="h-3.5 w-3.5" /> CONFIGURATION</div>
        <h1 className="mt-1 font-display text-3xl font-bold">Settings</h1>
      </header>

      <section className="glass-strong rounded-3xl p-6">
        <h2 className="font-display text-lg font-semibold">Avatar</h2>
        <div className="mt-4 flex flex-wrap items-center gap-5">
          <img
            src={resolveAvatarUrl(p.profile.avatar_url) || heroAvatar}
            alt="Current avatar"
            width={96} height={96}
            className="h-24 w-24 rounded-full object-cover ring-2 ring-primary/60 shadow-glow-primary"
          />
          <div className="flex flex-wrap gap-2">
            <button onClick={() => fileRef.current?.click()} disabled={busy}
              className="inline-flex items-center gap-2 rounded-xl bg-gradient-primary px-4 py-2.5 font-display text-sm font-semibold text-primary-foreground shadow-glow-primary transition-all hover:scale-[1.02] disabled:opacity-60">
              <Upload className="h-4 w-4" /> Upload custom
            </button>
            <button onClick={() => setGalleryOpen(true)} className="rounded-xl glass px-4 py-2.5 text-sm font-medium hover:shadow-glow-secondary transition-all">
              Use default hero
            </button>
            <input ref={fileRef} type="file" accept="image/*" onChange={onUpload} className="hidden" />
          </div>
        </div>
      </section>

      <Dialog open={galleryOpen} onOpenChange={setGalleryOpen}>
        <DialogContent className="max-w-2xl glass-strong border-primary/30">
          <DialogHeader>
            <DialogTitle className="font-display">Choose your hero</DialogTitle>
            <DialogDescription>Pick any avatar from the default gallery. You can still upload a custom image anytime.</DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-3 max-h-[60vh] overflow-y-auto pr-1">
            {DEFAULT_AVATARS.map(a => {
              const selected = p.profile?.avatar_url === `default:${a.id}`;
              const isSaving = savingAvatar === a.id;
              return (
                <button
                  key={a.id}
                  type="button"
                  onClick={() => pickDefaultAvatar(a.id)}
                  disabled={!!savingAvatar}
                  className={cn(
                    "relative aspect-square rounded-full overflow-hidden ring-2 transition-all hover:scale-[1.04]",
                    selected ? "ring-primary shadow-glow-primary" : "ring-border hover:ring-secondary",
                    savingAvatar && !isSaving && "opacity-50"
                  )}
                  aria-label={`Select avatar ${a.id}`}
                >
                  <img src={a.url} alt={`Default avatar ${a.id}`} loading="lazy" className="h-full w-full object-cover" />
                  {isSaving && (
                    <span className="absolute inset-0 flex items-center justify-center bg-background/60">
                      <Loader2 className="h-5 w-5 animate-spin text-primary" />
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </DialogContent>
      </Dialog>

      <section className="glass-strong rounded-3xl p-6">
        <h2 className="font-display text-lg font-semibold">Username</h2>
        <p className="mt-1 text-sm text-muted-foreground">Currently: <span className="font-semibold text-foreground">{p.profile.username}</span></p>
        <div className="mt-3 flex flex-wrap gap-2">
          <input
            value={username} onChange={e => setUsername(e.target.value)}
            placeholder="New username"
            className="flex-1 min-w-[200px] rounded-xl bg-muted/40 px-4 py-2.5 text-sm outline-none ring-1 ring-border focus:ring-primary"
          />
          <button onClick={saveName} className="rounded-xl bg-gradient-primary px-4 py-2.5 font-display text-sm font-semibold text-primary-foreground shadow-glow-primary transition-all hover:scale-[1.02]">
            Save
          </button>
        </div>
      </section>

      <section className="glass-strong rounded-3xl p-6">
        <h2 className="font-display text-lg font-semibold">Account</h2>
        <p className="mt-1 text-sm text-muted-foreground">Signed in as {user?.email}</p>
        <button onClick={signOut} className="mt-3 rounded-xl bg-destructive/15 px-4 py-2.5 text-sm font-medium text-destructive ring-1 ring-destructive/30 transition-colors hover:bg-destructive/25">
          Sign out
        </button>
      </section>
    </div>
  );
}
