import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

const GATEWAY_URL = "https://ai.gateway.lovable.dev/v1/audio/speech";
const MODEL = "google/gemini-3.1-flash-tts-preview";

// أصوات Gemini المسبقة: نسائي/رجالي
const VOICE_FEMALE = "Kore";
const VOICE_MALE = "Charon";

export const Route = createFileRoute("/api/tts")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const auth = request.headers.get("authorization") ?? "";
        if (!auth.startsWith("Bearer ")) return new Response("Unauthorized", { status: 401 });
        const token = auth.slice(7);

        const SUPABASE_URL = process.env["SUPABASE_URL"];
        const SUPABASE_PUBLISHABLE_KEY = process.env["SUPABASE_PUBLISHABLE_KEY"];
        const key = process.env["LOVABLE_API_KEY"];
        if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY || !key)
          return new Response("Server not configured", { status: 500 });

        const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
          global: { headers: { Authorization: `Bearer ${token}` } },
          auth: { persistSession: false, autoRefreshToken: false },
        });
        const { data: claims, error: claimsError } = await supabase.auth.getClaims(token);
        if (claimsError || !claims?.claims?.sub)
          return new Response("Unauthorized", { status: 401 });

        const body = (await request.json().catch(() => null)) as {
          text?: string;
          lang?: string;
          gender?: "male" | "female";
        } | null;
        const text = (body?.text ?? "").trim();
        if (!text || text.length > 1200) return new Response("Invalid input", { status: 400 });
        const voiceName = body?.gender === "male" ? VOICE_MALE : VOICE_FEMALE;

        const upstream = await fetch(GATEWAY_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
          body: JSON.stringify({
            model: MODEL,
            contents: [{ role: "user", parts: [{ text }] }],
            generationConfig: {
              responseModalities: ["AUDIO"],
              speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName } } },
            },
          }),
        });

        if (!upstream.ok) {
          const detail = await upstream.text().catch(() => "");
          return new Response(detail || "TTS error", { status: upstream.status || 500 });
        }

        const audio = await upstream.arrayBuffer();
        return new Response(audio, {
          headers: {
            "Content-Type": upstream.headers.get("content-type") ?? "audio/wav",
            "Cache-Control": "no-store",
          },
        });
      },
    },
  },
});
