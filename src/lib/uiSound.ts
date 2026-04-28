// Lightweight WebAudio-based UI sound system.
// No external files — synthesized blips for instant, zero-bandwidth feedback.

let ctx: AudioContext | null = null;
let enabled = true;
const lastPlay = new Map<string, number>();
let lastHoverEl: HTMLElement | null = null;
let lastHoverAt = 0;

function getCtx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!ctx) {
    const AC = (window.AudioContext || (window as any).webkitAudioContext) as typeof AudioContext | undefined;
    if (!AC) return null;
    ctx = new AC();
  }
  if (ctx.state === "suspended") ctx.resume().catch(() => {});
  return ctx;
}

type Tone = {
  freq: number;
  type?: OscillatorType;
  duration?: number;
  gain?: number;
  sweepTo?: number;
};

function tone({ freq, type = "sine", duration = 0.08, gain = 0.05, sweepTo }: Tone) {
  const ac = getCtx();
  if (!ac || !enabled) return;
  const osc = ac.createOscillator();
  const g = ac.createGain();
  osc.type = type;
  const t0 = ac.currentTime;
  osc.frequency.setValueAtTime(freq, t0);
  if (sweepTo) osc.frequency.exponentialRampToValueAtTime(sweepTo, t0 + duration);
  g.gain.setValueAtTime(0, t0);
  g.gain.linearRampToValueAtTime(gain, t0 + 0.005);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
  osc.connect(g).connect(ac.destination);
  osc.start(t0);
  osc.stop(t0 + duration + 0.02);
}

function debounced(key: string, ms = 120): boolean {
  const now = performance.now();
  const prev = lastPlay.get(key) ?? 0;
  if (now - prev < ms) return false;
  lastPlay.set(key, now);
  return true;
}

export const uiSound = {
  hover() {
    // Per-call debounce handled by caller via element-aware logic.
    tone({ freq: 880, type: "sine", duration: 0.06, gain: 0.025, sweepTo: 1320 });
  },
  click() {
    if (!debounced("click", 60)) return;
    tone({ freq: 520, type: "triangle", duration: 0.09, gain: 0.06, sweepTo: 260 });
  },
  setEnabled(v: boolean) { enabled = v; },
  isEnabled() { return enabled; },
};

// Attach global delegated listeners — no per-component changes needed.
let installed = false;
export function installUiSounds() {
  if (installed || typeof window === "undefined") return;
  installed = true;

  const isInteractive = (el: Element | null): HTMLElement | null => {
    if (!el) return null;
    const node = (el as HTMLElement).closest(
      'button, a, [role="button"], [role="link"], [role="menuitem"], [role="tab"], [data-sound], [data-hover-sound="true"], .hover-sound, .interactive, input[type="checkbox"], input[type="radio"], input[type="submit"], input[type="button"], select, summary, label[for], [class*="card"], [class*="Card"]'
    );
    return node as HTMLElement | null;
  };

  // Hover (pointerover bubbles, unlike mouseenter)
  document.addEventListener(
    "pointerover",
    (e) => {
      const target = isInteractive(e.target as Element);
      if (!target) return;
      // Same interactive ancestor as before? skip (we're moving inside it)
      if (target === lastHoverEl) return;
      const now = performance.now();
      // Global rate-limit so rapid traversals don't spam
      if (now - lastHoverAt < 40) {
        lastHoverEl = target;
        lastHoverAt = now;
        return;
      }
      lastHoverEl = target;
      lastHoverAt = now;
      uiSound.hover();
    },
    { passive: true, capture: true }
  );

  // Click feedback (capture so it fires even if handlers stopPropagation)
  document.addEventListener(
    "pointerdown",
    (e) => {
      const target = isInteractive(e.target as Element);
      if (!target) return;
      uiSound.click();
    },
    { capture: true, passive: true }
  );

  // First user gesture unlocks the AudioContext on browsers that require it.
  const unlock = () => { getCtx(); window.removeEventListener("pointerdown", unlock); window.removeEventListener("keydown", unlock); };
  window.addEventListener("pointerdown", unlock, { once: true });
  window.addEventListener("keydown", unlock, { once: true });
}
