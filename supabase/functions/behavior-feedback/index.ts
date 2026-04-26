// Behavior Feedback edge function
// Takes a behavior profile (from `get_behavior_profile` RPC) and returns a single
// short coaching message + a suggested next action. Uses Lovable AI Gateway.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SYSTEM_PROMPT = `You are the in-game coach inside a productivity RPG called "Life RPG World".
You receive a JSON behavior profile computed from the player's real activity history.
Your job: produce ONE short, motivating, data-grounded message (max 28 words),
and a single concrete next-action suggestion (max 14 words).

Tone: warm, sharp, gamer-friendly. No emojis. No filler.
Always reference one concrete signal (peak hour, consistency %, burnout, decline, inactivity).
Never invent numbers — only use what's in the profile.
If status = "burnout" → recommend a rest day or a single light task.
If status = "inactive" → suggest a small re-entry activity.
If consistency >= 80 and burnout < 30 → encourage upping difficulty.
If a peak_hours entry exists → reference that hour ("9 PM" style) for hard tasks.`;

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body = await req.json().catch(() => ({}));
    const profile = body?.profile;
    if (!profile || typeof profile !== "object") {
      return new Response(JSON.stringify({ error: "missing_profile" }), {
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

    const userPrompt = `Behavior profile JSON:\n${JSON.stringify(profile)}\n\nReturn the coaching feedback now.`;

    const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: userPrompt },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "emit_feedback",
              description: "Return a single coaching message and next-action suggestion.",
              parameters: {
                type: "object",
                properties: {
                  message: { type: "string", description: "Short coaching message, max 28 words." },
                  next_action: { type: "string", description: "Concrete suggested next action, max 14 words." },
                  tone: {
                    type: "string",
                    enum: ["encourage", "warn", "celebrate", "rest", "wakeup"],
                  },
                },
                required: ["message", "next_action", "tone"],
                additionalProperties: false,
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "emit_feedback" } },
      }),
    });

    if (!aiRes.ok) {
      if (aiRes.status === 429) {
        return new Response(JSON.stringify({ error: "rate_limited" }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (aiRes.status === 402) {
        return new Response(JSON.stringify({ error: "credits_exhausted" }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const t = await aiRes.text();
      console.error("ai gateway error", aiRes.status, t);
      return new Response(JSON.stringify({ error: "ai_gateway_error" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await aiRes.json();
    const call = data?.choices?.[0]?.message?.tool_calls?.[0];
    let parsed: { message: string; next_action: string; tone: string } | null = null;
    try {
      parsed = call ? JSON.parse(call.function.arguments) : null;
    } catch (_e) {
      parsed = null;
    }

    if (!parsed) {
      return new Response(
        JSON.stringify({
          message: "Keep moving — every logged activity sharpens the curve.",
          next_action: "Log a quick activity to keep your streak alive.",
          tone: "encourage",
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    return new Response(JSON.stringify(parsed), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("behavior-feedback error", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "unknown" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});