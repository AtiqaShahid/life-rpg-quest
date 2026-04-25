import { useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Gamepad2 } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/context/AuthContext";

export default function Auth() {
  const { user } = useAuth();
  const nav = useNavigate();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [username, setUsername] = useState("");
  const [busy, setBusy] = useState(false);

  if (user) return <Navigate to="/app" replace />;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      if (mode === "signup") {
        if (!username.trim()) { toast.error("Pick a username"); setBusy(false); return; }
        const { error } = await supabase.auth.signUp({
          email, password,
          options: {
            data: { username: username.trim() },
            emailRedirectTo: `${window.location.origin}/app`,
          },
        });
        if (error) throw error;
        toast.success("Account created — entering the game…");
        nav("/app");
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        nav("/app");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="relative flex min-h-screen items-center justify-center px-4 py-12">
      <div className="pointer-events-none absolute -top-32 -right-32 h-[26rem] w-[26rem] rounded-full bg-primary/30 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-32 -left-32 h-[26rem] w-[26rem] rounded-full bg-secondary/20 blur-3xl" />

      <div className="relative w-full max-w-md">
        <Link to="/" className="mb-6 flex items-center justify-center gap-2.5">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-primary shadow-glow-primary">
            <Gamepad2 className="h-5 w-5 text-primary-foreground" />
          </div>
          <span className="font-display text-xl font-bold neon-text-primary">LIFE RPG</span>
        </Link>

        <div className="glass-strong rounded-3xl p-6 sm:p-8 animate-scale-in">
          <h1 className="font-display text-2xl font-bold">{mode === "signin" ? "Welcome back, hero" : "Create your save file"}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {mode === "signin" ? "Sign in to continue your run." : "Pick a name. Your character starts at level 1."}
          </p>

          <form onSubmit={submit} className="mt-6 space-y-3">
            {mode === "signup" && (
              <div className="space-y-1.5">
                <label className="font-mono text-[11px] tracking-widest text-muted-foreground">USERNAME</label>
                <input
                  required value={username} onChange={e => setUsername(e.target.value)}
                  placeholder="HeroName"
                  className="w-full rounded-xl bg-muted/40 px-4 py-3 text-sm outline-none ring-1 ring-border transition-all focus:ring-primary"
                />
              </div>
            )}
            <div className="space-y-1.5">
              <label className="font-mono text-[11px] tracking-widest text-muted-foreground">EMAIL</label>
              <input
                required type="email" value={email} onChange={e => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="w-full rounded-xl bg-muted/40 px-4 py-3 text-sm outline-none ring-1 ring-border transition-all focus:ring-primary"
              />
            </div>
            <div className="space-y-1.5">
              <label className="font-mono text-[11px] tracking-widest text-muted-foreground">PASSWORD</label>
              <input
                required type="password" minLength={6} value={password} onChange={e => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full rounded-xl bg-muted/40 px-4 py-3 text-sm outline-none ring-1 ring-border transition-all focus:ring-primary"
              />
            </div>
            <button
              type="submit" disabled={busy}
              className="mt-2 w-full rounded-xl bg-gradient-primary py-3 font-display font-semibold text-primary-foreground shadow-glow-primary transition-all hover:scale-[1.01] disabled:opacity-60"
            >
              {busy ? "Loading…" : mode === "signin" ? "Enter the game" : "Begin the journey"}
            </button>
          </form>

          <button
            onClick={() => setMode(mode === "signin" ? "signup" : "signin")}
            className="mt-5 w-full text-center text-xs text-muted-foreground hover:text-foreground"
          >
            {mode === "signin" ? "New here? Create an account →" : "Already a player? Sign in →"}
          </button>
        </div>
      </div>
    </div>
  );
}
