// Generate 1–3 "dynamic AI quests" tailored to the user's behavior profile.
// Behavior:
//   - Always AI-generated (never copy-pasted from a static pool).
//   - Constrained by thematic inspiration clusters + behavioral context.
//   - Per batch: 1 Focus/Discipline + 1 Health/Learning + 1 adaptive wildcard.
//   - Strong variation rule (no repetition vs. recent quests).

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Reference inspiration clusters (NOT a fixed pool — used only as semantic anchors).
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

Your job: generate freshly worded, real-life micro-quests that align with the provided thematic clusters but are NEVER copy-pasted from them. Each quest must read as newly authored.

Hard rules:
- Each quest MUST map to one of the provided activity type ids — do not invent new activity ids.
- difficulty is 1..10. Use the recommended difficulty as a strong prior.
- If status = "burnout" or "inactive": all quests must be low-energy and difficulty <= 4 (recovery framing).
- If consistency is high and burnout is low: lean into longer, harder focus/discipline quests.
- If consistency is low: short, low-friction, easy-win quests.
- Title <= 38 chars. Description <= 110 chars. No emojis. No filler. No quotes.
- linked_stats must be a subset of: intelligence, strength, discipline, charisma.
- target = sessions OR minutes OR xp to accumulate. unit = "count" | "minutes" | "xp".
- min_duration optional; only when criterion requires a minimum session length.

Composition rule (MANDATORY for the batch of 3):
  Quest 1 → Focus/Productivity OR Discipline theme.
  Quest 2 → Health OR Learning theme.
  Quest 3 → Adaptive wildcard — pick the cluster that best fits the user's current behavioral signals (peak hour, declining stats, social gaps, recovery need).

Variation rule (CRITICAL):
- Reword every quest differently from the "recent_quest_titles" provided. Do not reuse identical sentence structures.
- Vary action framing each cycle (e.g. "reduce distractions for 1 hour" vs "work distraction-free for 60 minutes").
- No two quests in the same batch may share the same theme cluster.
- Use the theme clusters ONLY as semantic anchors — never copy phrases verbatim.`;

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_ANON = Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ??
                          Deno.env.get("SUPABASE_ANON_KEY")!;
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      return json({ error: "ai_not_configured" }, 500);
    }

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "missing_auth" }, 401);

    // Per-user client — RLS enforced.
    const supa = createClient(SUPABASE_URL, SUPABASE_ANON, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: userData } = await supa.auth.getUser();
    if (!userData?.user) return json({ error: "unauthenticated" }, 401);

    // Load profile + activity types + recent quest titles (for variation enforcement).
    const [
      { data: profile, error: profErr },
      { data: types, error: typesErr },
      { data: recentQuests },
    ] = await Promise.all([
      supa.rpc("get_behavior_profile"),
      supa.from("activity_types").select("id, label, stat, description"),
      supa
        .from("quests")
        .select("title")
        .eq("quest_type", "dynamic")
        .order("created_at", { ascending: false })
        .limit(15),
    ]);
    if (profErr) return json({ error: "profile_failed", detail: profErr.message }, 500);
    if (typesErr) return json({ error: "types_failed", detail: typesErr.message }, 500);

    const allowedTypeIds = (types ?? []).map((t: { id: string }) => t.id);
    const recentTitles = (recentQuests ?? []).map((q: { title: string }) => q.title);

    // Inject a fresh randomness seed so the model produces a different batch each click.
    const seed = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

    const userPrompt =
      `Behavior profile:\n${JSON.stringify(profile)}\n\n` +
      `Allowed activity type ids: ${JSON.stringify(allowedTypeIds)}\n` +
      `Activity catalog: ${JSON.stringify(types)}\n\n` +
      `Reference theme clusters (semantic anchors only — DO NOT copy phrases):\n${JSON.stringify(THEMES)}\n\n` +
      `recent_quest_titles (avoid wording overlap with these):\n${JSON.stringify(recentTitles)}\n\n` +
      `Generation seed (use this to ensure novel phrasing): ${seed}\n\n` +
      `Generate exactly 3 dynamic quests following the composition rule:\n` +
      `  - Quest 1: Focus/Productivity OR Discipline.\n` +
      `  - Quest 2: Health OR Learning.\n` +
      `  - Quest 3: Adaptive wildcard chosen from the user's current signals.\n` +
      `Each must be freshly worded, with novel sentence structure, not echoing recent_quest_titles or theme phrasing.`;

    const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: SYSTEM },
          { role: "user", content: userPrompt },
        ],
        tools: [{
          type: "function",
          function: {
            name: "emit_quests",
            description: "Return exactly 3 freshly worded dynamic quests following the composition + variation rules.",
            parameters: {
              type: "object",
              properties: {
                quests: {
                  type: "array",
                  minItems: 3,
                  maxItems: 3,
                  items: {
                    type: "object",
                    properties: {
                      title: { type: "string" },
                      description: { type: "string" },
                      difficulty: { type: "integer", minimum: 1, maximum: 10 },
                      energy: { type: "string", enum: ["low","medium","high"] },
                      linked_stats: {
                        type: "array",
                        items: { type: "string", enum: ["intelligence","strength","discipline","charisma"] },
                      },
                      type_id: { type: "string", description: "Must be one of allowed activity type ids." },
                      min_duration: { type: "integer", minimum: 0 },
                      target: { type: "integer", minimum: 1 },
                      unit: { type: "string", enum: ["count","minutes","xp"] },
                      theme: {
                        type: "string",
                        enum: ["focus","discipline","health","learning","social"],
                        description: "Which inspiration cluster anchored this quest.",
                      },
                      reason: { type: "string", description: "Why this quest fits the player right now." },
                    },
                    required: ["title","description","difficulty","energy","linked_stats","type_id","target","unit","theme","reason"],
                    additionalProperties: false,
                  },
                },
              },
              required: ["quests"],
              additionalProperties: false,
            },
          },
        }],
        tool_choice: { type: "function", function: { name: "emit_quests" } },
      }),
    });

    if (!aiRes.ok) {
      if (aiRes.status === 429) return json({ error: "rate_limited" }, 429);
      if (aiRes.status === 402) return json({ error: "credits_exhausted" }, 402);
      const t = await aiRes.text();
      console.error("ai gateway", aiRes.status, t);
      return json({ error: "ai_gateway_error" }, 500);
    }

    const aiData = await aiRes.json();
    const call = aiData?.choices?.[0]?.message?.tool_calls?.[0];
    if (!call) return json({ error: "no_tool_call" }, 502);

    let parsed: { quests: Array<Record<string, unknown>> };
    try {
      parsed = JSON.parse(call.function.arguments);
    } catch (_e) {
      return json({ error: "bad_tool_args" }, 502);
    }

    // Server-side guards: dedupe vs recent titles + within-batch theme/title uniqueness.
    const recentTitleSet = new Set(recentTitles.map((t) => t.trim().toLowerCase()));
    const seenTitles = new Set<string>();
    const seenThemes = new Set<string>();

    const inserted: unknown[] = [];
    for (const q of parsed.quests ?? []) {
      const typeId = String(q.type_id);
      if (!allowedTypeIds.includes(typeId)) continue;

      const titleKey = String(q.title ?? "").trim().toLowerCase();
      if (!titleKey) continue;
      if (recentTitleSet.has(titleKey)) continue;     // variation rule
      if (seenTitles.has(titleKey)) continue;          // no in-batch dupes
      const themeKey = String(q.theme ?? "");
      if (themeKey && seenThemes.has(themeKey)) continue; // no two quests sharing theme

      const criteria: Record<string, unknown> = { type_id: typeId };
      if (typeof q.min_duration === "number" && q.min_duration > 0) {
        criteria.min_duration = q.min_duration;
      }

      const { data, error } = await supa.rpc("insert_dynamic_quest", {
        p_title: String(q.title).slice(0, 80),
        p_description: String(q.description).slice(0, 240),
        p_difficulty: Math.max(1, Math.min(10, Number(q.difficulty) || 3)),
        p_energy: ["low","medium","high"].includes(String(q.energy)) ? q.energy : "medium",
        p_linked_stats: Array.isArray(q.linked_stats) ? q.linked_stats : [],
        p_criteria: criteria,
        p_target: Math.max(1, Number(q.target) || 1),
        p_unit: ["count","minutes","xp"].includes(String(q.unit)) ? q.unit : "count",
        p_reason: `${themeKey || "wildcard"} | ${String(q.reason ?? "ai_generated")}`.slice(0, 200),
      });
      if (error) {
        console.error("insert_dynamic_quest error", error);
        continue;
      }
      seenTitles.add(titleKey);
      if (themeKey) seenThemes.add(themeKey);
      inserted.push(data);
    }

    return json({ ok: true, generated: inserted.length, quests: inserted });
  } catch (e) {
    console.error("generate-dynamic-quests fatal", e);
    return json({ error: e instanceof Error ? e.message : "unknown" }, 500);
  }

  function json(body: unknown, status = 200) {
    return new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});