// Generate 1–3 "dynamic AI quests" tailored to the user's behavior profile.
// Steps:
//   1) authenticate the caller (verify_jwt = true via header forward)
//   2) load behavior_profile + activity_types via the user's session
//   3) ask Lovable AI for quest specs via tool-calling
//   4) write each one back through `insert_dynamic_quest` RPC (RLS-safe)

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SYSTEM = `You are the Quest Master of "Life RPG World".
Generate 1–3 short, actionable quests tailored to the player's real behavior profile.

Hard rules:
- Each quest MUST map to one of the provided activity type ids — do not invent new ones.
- difficulty is 1..10. Use the recommended difficulty as a strong prior.
- If status = "burnout" or "inactive": all quests must be low-energy and difficulty <= 4.
- Prefer the user's peak hour for harder quests (mention it in the description).
- Title <= 38 chars. Description <= 110 chars. No emojis. No filler.
- linked_stats must be a subset of: intelligence, strength, discipline, charisma.
- target = how many sessions OR minutes OR xp the user must accumulate. unit = "count" | "minutes" | "xp".
- min_duration is optional; only set when the criterion requires a minimum session length.`;

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

    // Load profile + activity types
    const [{ data: profile, error: profErr }, { data: types, error: typesErr }] = await Promise.all([
      supa.rpc("get_behavior_profile"),
      supa.from("activity_types").select("id, label, stat, description"),
    ]);
    if (profErr) return json({ error: "profile_failed", detail: profErr.message }, 500);
    if (typesErr) return json({ error: "types_failed", detail: typesErr.message }, 500);

    const allowedTypeIds = (types ?? []).map((t: { id: string }) => t.id);

    const userPrompt = `Behavior profile:\n${JSON.stringify(profile)}\n\n` +
      `Allowed activity type ids: ${JSON.stringify(allowedTypeIds)}\n` +
      `Activity catalog: ${JSON.stringify(types)}\n\n` +
      `Generate 2-3 dynamic quests now.`;

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
            description: "Return 2-3 dynamic quests tailored to the player.",
            parameters: {
              type: "object",
              properties: {
                quests: {
                  type: "array",
                  minItems: 1,
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
                      reason: { type: "string", description: "Why this quest fits the player right now." },
                    },
                    required: ["title","description","difficulty","energy","linked_stats","type_id","target","unit","reason"],
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

    const inserted: unknown[] = [];
    for (const q of parsed.quests ?? []) {
      const typeId = String(q.type_id);
      if (!allowedTypeIds.includes(typeId)) continue;

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
        p_reason: String(q.reason ?? "ai_generated").slice(0, 200),
      });
      if (error) {
        console.error("insert_dynamic_quest error", error);
        continue;
      }
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