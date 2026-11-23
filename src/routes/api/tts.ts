import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { geminiTts, getGoogleApiKey } from "@/lib/google-ai.server";

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
        if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY)
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

        // Direct Google TTS only — never fall back to the paid Lovable AI gateway.
        if (!getGoogleApiKey()) return new Response("Neural TTS unavailable", { status: 503 });
        try {
          const audio = await geminiTts(text, voiceName);
          return new Response(audio, {
            headers: { "Content-Type": "audio/wav", "Cache-Control": "no-store" },
          });
        } catch {
          return new Response("Neural TTS failed", { status: 502 });
        }
      },
    },
  },
});
