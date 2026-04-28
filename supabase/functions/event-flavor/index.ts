// Rewrites a curated event template's title + tagline with thematic flavor.
// Input:  { events: [{ id, title, tagline, category, scope }] }
// Output: { items: [{ id, title, tagline }] }

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SYSTEM = `You are an event flavor writer for a productivity RPG called "Life RPG".
Rewrite each event's title and tagline so they feel like a limited-time challenge from an
immersive game. Rules:
- Keep title <= 28 chars, no emojis.
- Keep tagline <= 80 chars, ONE sentence, action-oriented, no emojis.
- Preserve the original mechanic (numbers, time windows, categories).
- Match the event's category tone: productivity → sharp, health → vital,
  learning → focused, social → collective, recovery → restorative.
- Never invent new requirements. Never add metrics that weren't in the original tagline.`;

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body = await req.json().catch(() => ({}));
    const events = body?.events;
    if (!Array.isArray(events) || events.length === 0) {
      return new Response(JSON.stringify({ items: [] }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!KEY) return new Response(JSON.stringify({ error: "ai_not_configured" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

    const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash-lite",
        messages: [
          { role: "system", content: SYSTEM },
          { role: "user", content: `Events:\n${JSON.stringify(events)}\n\nReturn rewritten items, one per input id.` },
        ],
        tools: [{
          type: "function",
          function: {
            name: "emit_flavor",
            description: "Return rewritten event titles and taglines.",
            parameters: {
              type: "object",
              properties: {
                items: {
                  type: "array", minItems: 1,
                  items: {
                    type: "object",
                    properties: {
                      id: { type: "string" },
                      title: { type: "string" },
                      tagline: { type: "string" },
                    },
                    required: ["id","title","tagline"],
                    additionalProperties: false,
                  },
                },
              },
              required: ["items"],
              additionalProperties: false,
            },
          },
        }],
        tool_choice: { type: "function", function: { name: "emit_flavor" } },
      }),
    });

    if (!aiRes.ok) {
      if (aiRes.status === 429) return new Response(JSON.stringify({ error: "rate_limited" }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      if (aiRes.status === 402) return new Response(JSON.stringify({ error: "credits_exhausted" }), { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      const t = await aiRes.text();
      console.error("ai gateway", aiRes.status, t);
      return new Response(JSON.stringify({ items: [] }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const data = await aiRes.json();
    const call = data?.choices?.[0]?.message?.tool_calls?.[0];
    let parsed: { items: { id: string; title: string; tagline: string }[] } = { items: [] };
    try { parsed = call ? JSON.parse(call.function.arguments) : { items: [] }; } catch { /* ignore */ }

    return new Response(JSON.stringify(parsed), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("event-flavor error", e);
    return new Response(JSON.stringify({ items: [] }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});