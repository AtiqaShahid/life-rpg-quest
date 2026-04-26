// Generate replacement-safe AI quests for Life RPG.
// Modes:
//   - dynamic-options (default): creates 3 selectable AI candidates.
//   - daily-slot: replaces exactly one unlocked daily dynamic slot.
//   - daily-all: replaces all unlocked daily dynamic slots.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const THEMES = {
  focus: [
    "complete one important task without delay",
    "30 minutes of deep focused work",
    "work without phone for a set window",
    "finish the task you've been postponing",
    "single-task for one full hour",
    "clear a backlog item",
    "plan tomorrow before sleep",
    "work in silence for 20 min",
  ],
  discipline: [
    "no social media for 2 hours",
    "do the hardest task first",
    "stick to today's schedule for half a day",
    "resist one distraction trigger",
    "follow morning routine fully",
    "reduce phone use intentionally",
    "act immediately instead of postponing",
    "end-day reflection in writing",
  ],
  health: [
    "walk 20–40 minutes outdoors",
    "drink 2–3 liters of water",
    "10–20 min light exercise",
    "stretch for 10 minutes",
    "stand and move every hour",
    "no screen 30 min before sleep",
    "eat a balanced healthy meal",
    "breathing exercise session",
  ],
  learning: [
    "read 15–30 minutes",
    "watch one educational video and summarize it",
    "practice a skill for 20 min",
    "learn 5 new words",
    "write structured notes from a topic",
    "teach a concept to someone",
    "active recall self-test",
    "deep dive on one weak area",
  ],
  social: [
    "have a meaningful conversation with someone",
    "express genuine gratitude to one person",
    "help someone with a small thing",
    "reconnect with someone you haven't talked to",
    "give a sincere compliment",
  ],
};

const SYSTEM = `You are the Quest Master of "Life RPG World" — a creative AI quest designer guided by behavioral psychology, NOT a fixed dataset picker.

Your job: generate freshly worded, real-life micro-quests that align with thematic clusters but are NEVER copy-pasted from them. Each regeneration is a true replacement: old quests must be treated as forbidden outputs.

Hard rules:
- Each quest MUST map to one provided activity type id. Do not invent activity ids.
- difficulty is 1..10. Use slot difficulty and behavioral recommendation as strong priors.
- If status = "burnout" or "inactive": all quests must be low-energy and difficulty <= 4.
- If consistency is high and burnout is low: lean into stronger focus/discipline quests.
- If consistency is low: short, low-friction, easy-win quests.
- Title <= 38 chars. Description <= 110 chars. No emojis. No filler. No quotes.
- linked_stats must be a subset of: intelligence, strength, discipline, charisma.
- target = sessions OR minutes OR xp to accumulate. unit = "count" | "minutes" | "xp".
- min_duration optional; only when criterion requires a minimum session length.

Variation rules:
- NEVER reuse a title from blocked_quest_memory.
- Avoid near-duplicates: change the concrete action, context, duration, and wording from blocked memory.
- Do not reuse identical sentence structures.
- Use theme clusters ONLY as semantic anchors — never copy phrases verbatim.
- For daily slot replacement, the new quest must feel clearly different from the quest currently in that slot.`;

type Mode = "dynamic-options" | "daily-slot" | "daily-all";
type QuestMemory = {
  id?: string;
  title: string;
  description?: string | null;
  quest_type?: string | null;
  status?: string | null;
  slot_index?: number | null;
};
type GeneratedQuest = {
  slot?: number;
  title: string;
  description: string;
  difficulty: number;
  energy: "low" | "medium" | "high";
  linked_stats: string[];
  type_id: string;
  min_duration?: number;
  target: number;
  unit: "count" | "minutes" | "xp";
  theme: "focus" | "discipline" | "health" | "learning" | "social";
  reason: string;
};

const STOPWORDS = new Set([
  "the", "and", "for", "with", "your", "you", "one", "this", "that", "from", "into", "task", "quest",
  "minutes", "minute", "session", "complete", "finish", "today", "daily", "work", "practice",
]);

function normalizeText(value: unknown) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function keywordSet(value: string) {
  return new Set(
    normalizeText(value)
      .split(" ")
      .filter((word) => word.length > 3 && !STOPWORDS.has(word)),
  );
}

function jaccard(a: Set<string>, b: Set<string>) {
  if (!a.size || !b.size) return 0;
  let intersection = 0;
  for (const word of a) if (b.has(word)) intersection += 1;
  return intersection / (a.size + b.size - intersection);
}

function tooSimilar(candidate: Pick<GeneratedQuest, "title" | "description">, memory: QuestMemory[]) {
  const title = normalizeText(candidate.title);
  const combined = `${candidate.title} ${candidate.description ?? ""}`;
  const candidateWords = keywordSet(combined);

  return memory.some((item) => {
    const memoryTitle = normalizeText(item.title);
    const memoryCombined = `${item.title ?? ""} ${item.description ?? ""}`;
    if (!title || !memoryTitle) return false;
    if (title === memoryTitle) return true;
    return jaccard(candidateWords, keywordSet(memoryCombined)) >= 0.85;
  });
}

function slotSpec(slot: number) {
  if (slot === 1) return "Slot 1: easy focus/productivity OR discipline quest; difficulty 1-4; short, concrete action.";
  if (slot === 2) return "Slot 2: health OR learning quest; difficulty 2-5; tangible body or knowledge progress.";
  return "Slot 3: adaptive wildcard from the user's signals; difficulty 3-6 unless recovery mode requires <=4.";
}

function readMode(body: Record<string, unknown>): Mode {
  if (body.mode === "daily-slot") return "daily-slot";
  if (body.mode === "daily-all") return "daily-all";
  return "dynamic-options";
}

async function readJson(req: Request) {
  try {
    return (await req.json()) as Record<string, unknown>;
  } catch (_e) {
    return {} as Record<string, unknown>;
  }
}

function tomorrowIso() {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

function questTool(count: number, dailySlots: boolean) {
  return [{
    type: "function",
    function: {
      name: "emit_quests",
      description: `Return exactly ${count} freshly worded quest${count === 1 ? "" : "s"} with no overlap against blocked memory.`,
      parameters: {
        type: "object",
        properties: {
          quests: {
            type: "array",
            items: {
              type: "object",
              properties: {
                slot: { type: "integer", enum: [1, 2, 3] },
                title: { type: "string" },
                description: { type: "string" },
                difficulty: { type: "integer", minimum: 1, maximum: 10 },
                energy: { type: "string", enum: ["low", "medium", "high"] },
                linked_stats: {
                  type: "array",
                  items: { type: "string", enum: ["intelligence", "strength", "discipline", "charisma"] },
                },
                type_id: { type: "string", description: "Must be one of allowed activity type ids." },
                min_duration: { type: "integer", minimum: 0 },
                target: { type: "integer", minimum: 1 },
                unit: { type: "string", enum: ["count", "minutes", "xp"] },
                theme: { type: "string", enum: ["focus", "discipline", "health", "learning", "social"] },
                reason: { type: "string" },
              },
            },
          },
        },
        required: ["quests"],
      },
    },
  }];
}

function buildPrompt(args: {
  mode: Mode;
  slots: number[];
  profile: unknown;
  allowedTypeIds: string[];
  types: unknown;
  memory: QuestMemory[];
  seed: string;
  rejected: QuestMemory[];
}) {
  const daily = args.mode !== "dynamic-options";
  const target = daily
    ? `Generate exactly ${args.slots.length} DAILY SLOT replacement quest${args.slots.length === 1 ? "" : "s"}, one for each slot: ${args.slots.join(", ")}.
Slot specs:\n${args.slots.map(slotSpec).join("\n")}`
    : `Generate exactly 3 selectable AI quest options following this composition:
Quest 1 → Focus/Productivity OR Discipline.
Quest 2 → Health OR Learning.
Quest 3 → Adaptive wildcard chosen from behavioral signals.`;

  return `Behavior profile:\n${JSON.stringify(args.profile)}\n\n` +
    `Allowed activity type ids: ${JSON.stringify(args.allowedTypeIds)}\n` +
    `Activity catalog: ${JSON.stringify(args.types)}\n\n` +
    `Reference theme clusters (semantic anchors only — DO NOT copy phrases):\n${JSON.stringify(THEMES)}\n\n` +
    `blocked_quest_memory (forbidden titles and near-duplicate meanings):\n${JSON.stringify(args.memory.slice(0, 80))}\n\n` +
    `additional_rejected_outputs_this_request:\n${JSON.stringify(args.rejected)}\n\n` +
    `Generation seed: ${args.seed}\n\n` +
    `${target}\n\n` +
    `Every returned quest must be brand new versus blocked_quest_memory. Do not output old slot titles with small wording changes.`;
}

async function callQuestAI(args: {
  apiKey: string;
  mode: Mode;
  slots: number[];
  profile: unknown;
  allowedTypeIds: string[];
  types: unknown;
  memory: QuestMemory[];
  rejected: QuestMemory[];
}) {
  const seed = `${Date.now()}-${crypto.randomUUID()}`;
  const prompt = buildPrompt({ ...args, seed });
  const count = args.mode === "dynamic-options" ? 3 : args.slots.length;
  const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${args.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "google/gemini-3-flash-preview",
      messages: [
        { role: "system", content: SYSTEM },
        { role: "user", content: prompt },
      ],
      tools: questTool(count, args.mode !== "dynamic-options"),
      tool_choice: { type: "function", function: { name: "emit_quests" } },
    }),
  });

  if (!aiRes.ok) {
    if (aiRes.status === 429) throw new Error("rate_limited");
    if (aiRes.status === 402) throw new Error("credits_exhausted");
    const detail = await aiRes.text();
    console.error("ai gateway", aiRes.status, detail);
    throw new Error("ai_gateway_error");
  }

  const aiData = await aiRes.json();
  const call = aiData?.choices?.[0]?.message?.tool_calls?.[0];
  if (!call) throw new Error("no_tool_call");

  try {
    const parsed = JSON.parse(call.function.arguments) as { quests?: GeneratedQuest[] | string };
    if (Array.isArray(parsed.quests)) return parsed.quests;
    if (typeof parsed.quests === "string") {
      const nested = JSON.parse(parsed.quests) as { quests?: GeneratedQuest[] } | GeneratedQuest[];
      return Array.isArray(nested) ? nested : nested.quests ?? [];
    }
    return [];
  } catch (_e) {
    throw new Error("bad_tool_args");
  }
}

function validateGenerated(args: {
  quests: GeneratedQuest[];
  mode: Mode;
  slots: number[];
  allowedTypeIds: string[];
  memory: QuestMemory[];
  accepted: GeneratedQuest[];
}) {
  const results: GeneratedQuest[] = [];
  const expectedSlots = new Set(args.slots);
  const takenSlots = new Set(args.accepted.map((q) => q.slot).filter((slot): slot is number => typeof slot === "number"));
  const seenTitles = new Set(args.accepted.map((q) => normalizeText(q.title)));
  const seenThemes = new Set(args.accepted.map((q) => q.theme));
  const localMemory = [...args.memory, ...args.accepted.map((q) => ({ title: q.title, description: q.description }))];

  for (const q of args.quests) {
    const title = String(q.title ?? "").trim();
    const description = String(q.description ?? "").trim();
    const titleKey = normalizeText(title);
    const typeId = coerceTypeId(q, args.allowedTypeIds);
    let slot = Number(q.slot);
    if (args.mode !== "dynamic-options" && !expectedSlots.has(slot)) {
      slot = args.slots.find((candidateSlot) => !takenSlots.has(candidateSlot)) ?? slot;
    }

    if (!title || !description || !typeId) continue;
    if (seenTitles.has(titleKey)) continue;
    if (tooSimilar({ title, description }, localMemory)) continue;

    if (args.mode !== "dynamic-options") {
      if (!expectedSlots.has(slot) || takenSlots.has(slot)) continue;
      takenSlots.add(slot);
    } else if (q.theme && seenThemes.has(q.theme)) {
      continue;
    }

    seenTitles.add(titleKey);
    if (q.theme) seenThemes.add(q.theme);
    localMemory.push({ title, description });
    results.push({
      ...q,
      slot: args.mode === "dynamic-options" ? undefined : slot,
      title: title.slice(0, 80),
      description: description.slice(0, 240),
      difficulty: Math.max(1, Math.min(10, Number(q.difficulty) || 3)),
      energy: ["low", "medium", "high"].includes(String(q.energy)) ? q.energy : "medium",
      linked_stats: Array.isArray(q.linked_stats) ? q.linked_stats.filter((s) => ["intelligence", "strength", "discipline", "charisma"].includes(String(s))) : [],
      type_id: typeId,
      min_duration: Number(q.min_duration) > 0 ? Number(q.min_duration) : undefined,
      target: Math.max(1, Number(q.target) || 1),
      unit: ["count", "minutes", "xp"].includes(String(q.unit)) ? q.unit : "count",
      reason: String(q.reason ?? "ai_generated").slice(0, 160),
    });
  }

  return results;
}

function coerceTypeId(q: GeneratedQuest, allowedTypeIds: string[]) {
  const raw = String(q.type_id ?? "");
  if (allowedTypeIds.includes(raw)) return raw;
  const byTheme: Record<string, string[]> = {
    focus: ["study"],
    discipline: ["study", "meditation"],
    health: ["workout", "cardio", "meditation"],
    learning: ["study"],
    social: ["socializing", "public_speaking"],
  };
  return byTheme[String(q.theme)]?.find((id) => allowedTypeIds.includes(id)) ?? allowedTypeIds[0] ?? raw;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  function json(body: unknown, status = 200) {
    return new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_ANON = Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ?? Deno.env.get("SUPABASE_ANON_KEY")!;
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) return json({ error: "ai_not_configured" }, 500);

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "missing_auth" }, 401);

    const supa = createClient(SUPABASE_URL, SUPABASE_ANON, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: userData } = await supa.auth.getUser();
    if (!userData?.user) return json({ error: "unauthenticated" }, 401);
    const userId = userData.user.id;

    const body = await readJson(req);
    const mode = readMode(body);
    let slots = mode === "daily-all" ? [1, 2, 3] : mode === "daily-slot" ? [Number(body.slot)] : [];
    if (mode === "daily-slot" && ![1, 2, 3].includes(slots[0])) return json({ error: "invalid_slot" }, 400);

    if (mode !== "dynamic-options") {
      const { data: lockedRows, error: lockedErr } = await supa
        .from("quests")
        .select("slot_index")
        .eq("user_id", userId)
        .eq("quest_type", "daily")
        .eq("is_compulsory", false)
        .eq("status", "locked")
        .in("slot_index", slots);
      if (lockedErr) return json({ error: "locked_check_failed", detail: lockedErr.message }, 500);

      const lockedSlots = new Set((lockedRows ?? []).map((row: { slot_index: number | null }) => row.slot_index).filter(Boolean));
      slots = slots.filter((slot) => !lockedSlots.has(slot));
      if (slots.length === 0) return json({ ok: true, generated: 0, skipped: [...lockedSlots], reason: "all_slots_locked" });
    }

    const [profileRes, typesRes, memoryRes] = await Promise.all([
      supa.rpc("get_behavior_profile"),
      supa.from("activity_types").select("id, label, stat, description"),
      supa
        .from("quests")
        .select("id,title,description,quest_type,status,slot_index,created_at")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(80),
    ]);

    if (profileRes.error) return json({ error: "profile_failed", detail: profileRes.error.message }, 500);
    if (typesRes.error) return json({ error: "types_failed", detail: typesRes.error.message }, 500);

    const types = typesRes.data ?? [];
    const allowedTypeIds = types.map((t: { id: string }) => t.id);
    const memory = ((memoryRes.data ?? []) as QuestMemory[]).filter((item) => item.title);
    const needed = mode === "dynamic-options" ? 3 : slots.length;
    const accepted: GeneratedQuest[] = [];
    const rejected: QuestMemory[] = [];

    for (let attempt = 0; attempt < 3 && accepted.length < needed; attempt += 1) {
      const batch = await callQuestAI({
        apiKey: LOVABLE_API_KEY,
        mode,
        slots,
        profile: profileRes.data,
        allowedTypeIds,
        types,
        memory,
        rejected,
      });

      const valid = validateGenerated({ quests: batch, mode, slots, allowedTypeIds, memory: [...memory, ...rejected], accepted });
      for (const q of valid) {
        if (accepted.length >= needed) break;
        if (mode !== "dynamic-options" && accepted.some((existing) => existing.slot === q.slot)) continue;
        accepted.push(q);
      }

      for (const q of batch) rejected.push({ title: String(q.title ?? ""), description: String(q.description ?? "") });
    }

    if (accepted.length < needed) {
      return json({ ok: false, error: "not_unique_enough", generated: 0 }, 409);
    }

    if (mode === "dynamic-options") {
      const { data: stale } = await supa
        .from("quests")
        .select("id")
        .eq("user_id", userId)
        .eq("quest_type", "dynamic")
        .in("status", ["candidate", "active"]);
      const staleIds = (stale ?? []).map((r: { id: string }) => r.id);
      if (staleIds.length > 0) {
        await supa.from("quest_progress").delete().in("quest_id", staleIds);
        await supa.from("quests").update({ status: "discarded" }).in("id", staleIds);
      }
    } else {
      const { data: oldSlots } = await supa
        .from("quests")
        .select("id")
        .eq("user_id", userId)
        .eq("quest_type", "daily")
        .eq("is_compulsory", false)
        .in("status", ["candidate", "active"])
        .in("slot_index", slots);
      const oldIds = (oldSlots ?? []).map((r: { id: string }) => r.id);
      if (oldIds.length > 0) {
        await supa.from("quest_progress").delete().in("quest_id", oldIds);
        await supa.from("quests").update({ status: "discarded" }).in("id", oldIds);
      }
    }

    const inserted: unknown[] = [];
    for (const q of accepted) {
      const questType = mode === "dynamic-options" ? "dynamic" : "daily";
      const { data: xpData } = await supa.rpc("compute_quest_xp", {
        p_user: userId,
        p_difficulty: q.difficulty,
        p_type: questType,
      });
      const rewardXp = Math.max(1, Number((xpData as Record<string, unknown> | null)?.final) || Math.round(15 * Math.pow(q.difficulty, 1.25)));
      const criteria: Record<string, unknown> = { type_id: q.type_id };
      if (q.min_duration && q.min_duration > 0) criteria.min_duration = q.min_duration;

      const { data: questRow, error: insertErr } = await supa
        .from("quests")
        .insert({
          user_id: userId,
          title: q.title,
          description: q.description,
          quest_type: questType,
          difficulty: q.difficulty,
          linked_stats: q.linked_stats,
          energy: q.energy,
          criteria,
          status: mode === "dynamic-options" ? "candidate" : "active",
          reward_xp: rewardXp,
          is_daily: mode !== "dynamic-options",
          expires_at: mode === "dynamic-options" ? new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString() : tomorrowIso(),
          generation_reason: `${mode}${q.slot ? ` slot=${q.slot}` : ""} | ${q.theme} | ${q.reason}`.slice(0, 220),
          template_key: mode === "dynamic-options" ? "dynamic_ai" : `daily_ai_slot_${q.slot}`,
          is_compulsory: false,
          slot_index: mode === "dynamic-options" ? null : q.slot,
        })
        .select("*")
        .single();

      if (insertErr || !questRow) {
        console.error("quest insert error", insertErr);
        continue;
      }

      const { error: progressErr } = await supa.from("quest_progress").insert({
        quest_id: questRow.id,
        user_id: userId,
        current: 0,
        target: q.target,
        unit: q.unit,
      });
      if (progressErr) console.error("quest progress insert error", progressErr);

      inserted.push(questRow);
    }

    return json({ ok: true, mode, generated: inserted.length, quests: inserted });
  } catch (e) {
    const message = e instanceof Error ? e.message : "unknown";
    console.error("generate-dynamic-quests fatal", message, e);
    if (message === "rate_limited") return json({ error: "rate_limited" }, 429);
    if (message === "credits_exhausted") return json({ error: "credits_exhausted" }, 402);
    if (["ai_gateway_error", "no_tool_call", "bad_tool_args"].includes(message)) return json({ error: message }, 502);
    return json({ error: message }, 500);
  }
});
