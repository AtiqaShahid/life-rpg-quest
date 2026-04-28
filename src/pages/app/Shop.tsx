import { useMemo } from "react";
import { Coins, Gem, ShoppingBag, Package, Zap, Shield, HeartPulse, Clock, Sparkles } from "lucide-react";
import { usePlayer } from "@/hooks/usePlayer";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const CATEGORY_ICON: Record<string, typeof Zap> = {
  boost: Zap,
  protection: Shield,
  recovery: HeartPulse,
};

function formatDuration(min: number | null) {
  if (!min) return "Instant";
  if (min >= 60 && min % 60 === 0) return `${min / 60}h`;
  if (min >= 60) return `${(min / 60).toFixed(1)}h`;
  return `${min}m`;
}

function timeLeft(iso: string | null): string | null {
  if (!iso) return null;
  const ms = new Date(iso).getTime() - Date.now();
  if (ms <= 0) return null;
  const m = Math.floor(ms / 60000);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  const rem = m % 60;
  return `${h}h ${rem}m`;
}

export default function Shop() {
  const { profile, shopItems, inventory, activeEffects, purchaseItem, useItem, loading } = usePlayer();

  const econ = profile as unknown as { coins: number; tokens: number; exhaustion: number } | null;
  const coins = econ?.coins ?? 0;
  const tokens = econ?.tokens ?? 0;
  const exhaustion = econ?.exhaustion ?? 0;

  const invByItem = useMemo(() => {
    const m = new Map<string, { quantity: number; last_used_at: string | null }>();
    inventory.forEach((i) => m.set(i.item_id, { quantity: i.quantity, last_used_at: i.last_used_at }));
    return m;
  }, [inventory]);

  const owned = shopItems.filter((s) => (invByItem.get(s.id)?.quantity ?? 0) > 0);

  if (loading) return <div className="p-6 text-muted-foreground">Loading shop…</div>;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="glass-strong flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-border/50 p-4 sm:p-6">
        <div>
          <h1 className="font-display text-2xl font-bold neon-text-primary sm:text-3xl">Item Shop</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Spend Coins and Tokens on boosts, protection, and recovery.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="glass flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-mono">
            <Coins className="h-4 w-4 text-amber-400" />
            <span className="font-semibold tabular-nums">{coins}</span>
          </div>
          <div className="glass flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-mono">
            <Gem className="h-4 w-4 text-secondary" />
            <span className="font-semibold tabular-nums">{tokens}</span>
          </div>
          <div
            className={cn(
              "glass flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-mono",
              exhaustion >= 70 ? "text-destructive" : exhaustion >= 40 ? "text-amber-400" : "text-muted-foreground",
            )}
            title="Exhaustion lowers your XP gain. Recover by resting or using a Burnout Reset."
          >
            <HeartPulse className="h-4 w-4" />
            <span className="font-semibold tabular-nums">{exhaustion}/100 Exhaustion</span>
          </div>
        </div>
      </div>

      {/* Active effects */}
      {activeEffects.length > 0 && (
        <div className="glass rounded-2xl border border-primary/30 p-4 shadow-glow-primary">
          <div className="mb-3 flex items-center gap-2 font-display text-sm font-semibold">
            <Sparkles className="h-4 w-4 text-primary" /> Active Effects
          </div>
          <div className="flex flex-wrap gap-2">
            {activeEffects.map((e) => {
              const item = shopItems.find((s) => s.id === e.item_id);
              const left = timeLeft(e.expires_at);
              return (
                <div key={e.id} className="glass flex items-center gap-2 rounded-xl px-3 py-1.5 text-xs">
                  <span className="text-base">{item?.icon ?? "✨"}</span>
                  <span className="font-medium">{item?.name ?? e.effect_kind}</span>
                  {e.effect_kind === "xp_multiplier" && (
                    <Badge variant="outline" className="border-primary/40 text-primary">
                      x{e.effect_value.toFixed(2)}
                    </Badge>
                  )}
                  {left && (
                    <span className="flex items-center gap-1 text-muted-foreground">
                      <Clock className="h-3 w-3" /> {left}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      <Tabs defaultValue="shop" className="space-y-4">
        <TabsList className="glass-strong">
          <TabsTrigger value="shop" className="gap-2">
            <ShoppingBag className="h-4 w-4" /> Shop
          </TabsTrigger>
          <TabsTrigger value="inventory" className="gap-2">
            <Package className="h-4 w-4" /> Inventory ({owned.reduce((n, i) => n + (invByItem.get(i.id)?.quantity ?? 0), 0)})
          </TabsTrigger>
        </TabsList>

        {/* SHOP */}
        <TabsContent value="shop" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {shopItems.map((item) => {
            const Icon = CATEGORY_ICON[item.category] ?? Zap;
            const balance = item.currency === "coins" ? coins : tokens;
            const canAfford = balance >= item.cost;
            const owned = invByItem.get(item.id)?.quantity ?? 0;
            return (
              <div
                key={item.id}
                className="glass relative flex flex-col gap-3 rounded-2xl border border-border/50 p-4 transition-all hover:border-primary/40 hover:shadow-glow-primary"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="text-2xl">{item.icon}</span>
                    <div>
                      <div className="font-display font-semibold leading-tight">{item.name}</div>
                      <div className="mt-0.5 flex items-center gap-1 text-[10px] uppercase tracking-wider text-muted-foreground">
                        <Icon className="h-3 w-3" /> {item.category}
                      </div>
                    </div>
                  </div>
                  {owned > 0 && (
                    <Badge variant="secondary" className="text-[10px]">
                      Owned ×{owned}
                    </Badge>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">{item.description}</p>
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <Clock className="h-3 w-3" /> {formatDuration(item.duration_min)}
                  </span>
                  {item.cooldown_min > 0 && (
                    <span className="text-muted-foreground/70">
                      Cooldown {formatDuration(item.cooldown_min)}
                    </span>
                  )}
                </div>
                <Button
                  onClick={() => purchaseItem(item.id, 1)}
                  disabled={!canAfford}
                  className={cn(
                    "w-full gap-2",
                    item.currency === "tokens" && "bg-secondary text-secondary-foreground hover:bg-secondary/90",
                  )}
                >
                  {item.currency === "coins" ? (
                    <Coins className="h-4 w-4" />
                  ) : (
                    <Gem className="h-4 w-4" />
                  )}
                  {item.cost} {item.currency === "coins" ? "Coins" : "Tokens"}
                </Button>
              </div>
            );
          })}
        </TabsContent>

        {/* INVENTORY */}
        <TabsContent value="inventory" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {owned.length === 0 && (
            <div className="glass col-span-full rounded-2xl p-8 text-center text-sm text-muted-foreground">
              Your bag is empty. Buy items in the Shop tab.
            </div>
          )}
          {owned.map((item) => {
            const inv = invByItem.get(item.id)!;
            const cooldownLeft = inv.last_used_at && item.cooldown_min > 0
              ? timeLeft(new Date(new Date(inv.last_used_at).getTime() + item.cooldown_min * 60000).toISOString())
              : null;
            return (
              <div
                key={item.id}
                className="glass flex flex-col gap-3 rounded-2xl border border-border/50 p-4"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="text-2xl">{item.icon}</span>
                    <div>
                      <div className="font-display font-semibold leading-tight">{item.name}</div>
                      <div className="mt-0.5 text-[10px] uppercase tracking-wider text-muted-foreground">
                        ×{inv.quantity} owned
                      </div>
                    </div>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">{item.description}</p>
                <Button
                  onClick={() => useItem(item.id)}
                  disabled={!!cooldownLeft || inv.quantity < 1}
                  variant="secondary"
                  className="w-full gap-2"
                >
                  {cooldownLeft ? `Cooldown ${cooldownLeft}` : "Use item"}
                </Button>
              </div>
            );
          })}
        </TabsContent>
      </Tabs>
    </div>
  );
}