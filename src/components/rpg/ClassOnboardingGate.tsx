import { usePlayer, type CharacterClass } from "@/hooks/usePlayer";
import { Button } from "@/components/ui/button";
import { useState } from "react";
import { ArrowLeft, Check, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Multi-step onboarding gate. Blocks the dashboard until the user picks a class.
 * Steps:
 *   1. Welcome
 *   2. Class selection (with sticky Continue CTA, Back nav, progress indicator)
 *   3. Confirmation / playstyle preview → "Enter the world"
 * Only mounted while profile.class_type IS NULL.
 */

const TOTAL_STEPS = 3;

const PLAYSTYLE_BLURB: Record<CharacterClass, string> = {
  scholar: "You chose Scholar — your journey will focus on mastery, study, and deep learning.",
  warrior: "You chose Warrior — discipline, consistency, and physical strength will define your path.",
  creator: "You chose Creator — building, shipping, and creative momentum will fuel your XP.",
  leader:  "You chose Leader — balanced growth and lifting your party will be your strength.",
};

export const ClassOnboardingGate = () => {
  const { profile, classCatalog, selectClass, loading } = usePlayer();
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [selected, setSelected] = useState<CharacterClass | null>(null);
  const [saving, setSaving] = useState(false);

  const econ = profile as unknown as { class_type: CharacterClass | null } | null;
  if (loading || !profile) return null;
  if (econ?.class_type) return null;

  const selectedConfig = classCatalog.find((c) => c.id === selected) ?? null;

  const handleContinue = async () => {
    if (step === 1) { setStep(2); return; }
    if (step === 2) {
      if (!selected) return;
      setSaving(true);
      try {
        await selectClass(selected, false);
        setStep(3);
      } finally {
        setSaving(false);
      }
      return;
    }
    // step 3 → unmount handled by class_type becoming non-null on next render
  };

  const handleBack = () => {
    if (step === 2) setStep(1);
    else if (step === 3) setStep(2);
  };

  const ctaLabel =
    step === 1 ? "Begin character setup"
    : step === 2 ? (selected ? "Continue" : "Select a class to continue")
    : "Enter the world";

  const ctaDisabled = (step === 2 && !selected) || saving;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-background/95 p-4 backdrop-blur-md">
      <div
        className="glass-strong flex w-full max-w-3xl flex-col overflow-hidden rounded-3xl border border-primary/30 shadow-glow-primary"
        style={{ maxHeight: "92vh" }}
      >
        {/* Header: back + step indicator */}
        <div className="flex items-center justify-between gap-3 border-b border-border/40 px-5 py-3 sm:px-7">
          <button
            type="button"
            onClick={handleBack}
            disabled={step === 1 || saving}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs text-muted-foreground transition-colors",
              "hover:text-foreground disabled:opacity-30 disabled:hover:text-muted-foreground",
            )}
          >
            <ArrowLeft className="h-3.5 w-3.5" /> Back
          </button>
          <div className="flex flex-1 items-center justify-center gap-3">
            <span className="font-mono text-[10px] uppercase tracking-[0.3em] text-secondary">
              Step {step} of {TOTAL_STEPS}
            </span>
            <div className="hidden flex-1 max-w-[180px] sm:block">
              <div className="h-1 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full bg-gradient-to-r from-primary to-secondary transition-all duration-500"
                  style={{ width: `${(step / TOTAL_STEPS) * 100}%` }}
                />
              </div>
            </div>
          </div>
          <div className="w-12" />
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5 sm:p-7">
          {step === 1 && (
            <div className="animate-fade-in space-y-4 text-center">
              <div className="font-mono text-[10px] tracking-[0.3em] text-secondary">CHARACTER CREATION</div>
              <h2 className="font-display text-2xl font-bold neon-text-primary sm:text-3xl">Welcome, hero.</h2>
              <p className="mx-auto max-w-lg text-sm text-muted-foreground">
                Before your journey begins, you'll choose a class. Your class shapes how XP is earned and how your story unfolds — but you can change paths later (7-day cooldown or 500 coins).
              </p>
              <div className="mx-auto grid max-w-md grid-cols-4 gap-2 pt-2">
                {classCatalog.map((c) => (
                  <div key={c.id} className="glass rounded-xl border border-border/40 p-2 text-center">
                    <div className="text-2xl">{c.icon}</div>
                    <div className="mt-1 text-[10px] font-medium text-muted-foreground">{c.name}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="animate-fade-in space-y-4">
              <div className="text-center">
                <h2 className="font-display text-xl font-bold neon-text-primary sm:text-2xl">Choose your path</h2>
                <p className="mt-1 text-xs text-muted-foreground">Tap a class to select, then press Continue.</p>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                {classCatalog.map((c) => {
                  const isSelected = selected === c.id;
                  return (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => setSelected(c.id)}
                      disabled={saving}
                      className={cn(
                        "glass relative flex flex-col gap-2 rounded-2xl border p-4 text-left transition-all duration-200",
                        "hover:border-primary/60",
                        isSelected
                          ? "scale-[1.02] border-primary shadow-glow-primary"
                          : "border-border/50 hover:scale-[1.01]",
                      )}
                    >
                      {isSelected && (
                        <div className="absolute right-2 top-2 flex items-center gap-1 rounded-full bg-primary/20 px-2 py-0.5 text-[10px] font-mono uppercase tracking-widest text-primary">
                          <Check className="h-3 w-3" /> Selected
                        </div>
                      )}
                      <div className="flex items-start gap-3">
                        <div className="text-3xl leading-none">{c.icon}</div>
                        <div>
                          <div className="font-display text-lg font-bold">{c.name}</div>
                          <div className="text-xs text-muted-foreground">{c.tagline}</div>
                        </div>
                      </div>
                      <p className="text-xs text-muted-foreground">{c.description}</p>
                      <ul className="mt-1 space-y-0.5 text-[11px]">
                        {c.strengths.map((s) => (
                          <li key={s} className="text-foreground/90">• {s}</li>
                        ))}
                      </ul>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {step === 3 && selectedConfig && (
            <div className="animate-fade-in space-y-5 text-center">
              <div className="mx-auto flex h-24 w-24 items-center justify-center rounded-full border-2 border-primary/40 bg-primary/10 text-5xl shadow-glow-primary animate-scale-in">
                {selectedConfig.icon}
              </div>
              <div className="space-y-1">
                <div className="font-mono text-[10px] tracking-[0.3em] text-secondary">CLASS LOCKED IN</div>
                <h2 className="font-display text-2xl font-bold neon-text-primary sm:text-3xl">
                  {selectedConfig.name}
                </h2>
                <p className="mx-auto max-w-lg text-sm text-muted-foreground">
                  {PLAYSTYLE_BLURB[selectedConfig.id]}
                </p>
              </div>
              <div className="mx-auto grid max-w-md gap-2 text-left">
                {selectedConfig.strengths.map((s) => (
                  <div key={s} className="glass flex items-start gap-2 rounded-xl border border-border/40 p-2 text-xs">
                    <Sparkles className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" /> {s}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Sticky footer CTA */}
        <div className="border-t border-border/40 bg-background/40 px-5 py-3 backdrop-blur sm:px-7">
          <Button
            className="w-full transition-all duration-200"
            size="lg"
            disabled={ctaDisabled}
            onClick={handleContinue}
          >
            {saving ? "Saving your class…" : ctaLabel}
          </Button>
        </div>
      </div>
    </div>
  );
};