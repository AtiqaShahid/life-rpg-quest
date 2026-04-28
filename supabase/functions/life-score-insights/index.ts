// Life Score Insights — turns raw analytics into a behavioral-analyst report.
// Input: { snapshot } where snapshot is the JSON returned by `get_life_score` RPC.
// Output: { summary, risk_level, predictions[], recommendations[], focus_metric }

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SYSTEM_PROMPT = `You are a behavioral analyst embedded in a productivity RPG.
You receive a JSON snapshot containing a Life Score (0-100), a four-component breakdown
(discipline, consistency, completion, energy), raw signals (streak, gaps, hard-task counts,
hour stddev, week-over-week deltas), and rule-based trends/predictions/recommendations.

Your job: produce ONE concise analyst report. Rules:
- Tone: analytical, precise, no motivational fluff, no emojis, no "good job".
- Every claim must reference a concrete number from the snapshot (a percentage, a delta,
  a streak length, a gap count, etc.). Never invent numbers.
- Predictions must be specific (timeframe + mechanism), e.g. "streak break in 3-4 days
  if active days stay below 4/7".
- Recommendations must be actionable and quantified (e.g. "cut hard-task share from 60% to 40%").
- Pick exactly ONE focus_metric from: discipline, consistency, completion, energy — the
  weakest component most likely to drag the Life Score down next week.
- risk_level: "stable" | "watch" | "burnout" | "decline" | "inactive".`;

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body = await req.json().catch(() => ({}));
    const snapshot = body?.snapshot;
    if (!snapshot || typeof snapshot !== "object") {
      return new Response(JSON.stringify({ error: "missing_snapshot" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      return new Response(JSON.stringify({ error: "ai_not_configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: `Life Score snapshot JSON:\n${JSON.stringify(snapshot)}\n\nReturn the analyst report.` },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "emit_report",
              description: "Return a behavioral analyst report grounded in the snapshot.",
              parameters: {
                type: "object",
                properties: {
                  summary: { type: "string", description: "1-2 sentence headline diagnosis with specific numbers, ≤45 words." },
                  risk_level: { type: "string", enum: ["stable","watch","burnout","decline","inactive"] },
                  focus_metric: { type: "string", enum: ["discipline","consistency","completion","energy"] },
                  predictions: {
                    type: "array", minItems: 1, maxItems: 3,
                    items: { type: "string", description: "Specific, time-bounded forecast grounded in a signal." },
                  },
                  recommendations: {
                    type: "array", minItems: 1, maxItems: 3,
                    items: { type: "string", description: "Quantified, actionable recommendation tied to a signal." },
                  },
                },
                required: ["summary","risk_level","focus_metric","predictions","recommendations"],
                additionalProperties: false,
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "emit_report" } },
      }),
    });

    if (!aiRes.ok) {
      if (aiRes.status === 429) return new Response(JSON.stringify({ error: "rate_limited" }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      if (aiRes.status === 402) return new Response(JSON.stringify({ error: "credits_exhausted" }), { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      const t = await aiRes.text();
      console.error("ai gateway error", aiRes.status, t);
      return new Response(JSON.stringify({ error: "ai_gateway_error" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const data = await aiRes.json();
    const call = data?.choices?.[0]?.message?.tool_calls?.[0];
    let parsed: unknown = null;
    try { parsed = call ? JSON.parse(call.function.arguments) : null; } catch { parsed = null; }

    if (!parsed) {
      return new Response(JSON.stringify({
        summary: "Insufficient signal extracted from model output.",
        risk_level: "watch",
        focus_metric: "consistency",
        predictions: ["Unable to forecast — re-run after logging more activity."],
        recommendations: ["Log at least 3 activities across 3 different days to enable analysis."],
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    return new Response(JSON.stringify(parsed), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("life-score-insights error", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "unknown" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});