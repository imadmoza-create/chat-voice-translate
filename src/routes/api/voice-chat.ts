import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

const GATEWAY_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";
const MODEL = "google/gemini-3-flash-preview";
// حدّ صارم لتقليل الكلفة والتأخير في الوضع الصوتي
const MAX_VOICE_TOKENS = 120;

function voicePrompt(langName: string, nativeName: string, level: string, scenario?: string, student?: string) {
  return `أنت "المعلم الذكي" — مدرّس ${langName} ودود وطبيعي يتحدّث صوتياً مع طالب ناطق بـ${nativeName}. مستوى الطالب: ${level}.
${scenario ? `السيناريو: ${scenario}\n` : ""}${student ? `معلومات الطالب: ${student}\n` : ""}
قواعد صارمة للوضع الصوتي:
- ردّ من جملة إلى ثلاث جمل قصيرة جداً فقط. ممنوع الشرح الطويل أو القوائم أو Markdown.
- تحدّث أساساً بلغة ${langName} بمستوى ${level}، واستخدم ${nativeName} فقط لتوضيح خطأ أو كلمة صعبة بكلمات قليلة.
- صحّح الخطأ بلطف وبسرعة ثم تابع.
- أنهِ كل ردّ بسؤال قصير جداً ليواصل الطالب الكلام.
- نصّ عادي فقط بدون رموز أو JSON.
- اللغة الهدف الآن ${langName} ولغة الطالب الأم ${nativeName}؛ إذا تغيّرت اللغة الهدف من الإعدادات فتحوّل فوراً لمفردات وأمثلة اللغة الجديدة.`;
}

export const Route = createFileRoute("/api/voice-chat")({
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
        const { data: claimsData, error: claimsError } = await supabase.auth.getClaims(token);
        const userId = claimsData?.claims?.sub;
        if (claimsError || !userId) return new Response("Unauthorized", { status: 401 });

        const body = (await request.json().catch(() => null)) as {
          text?: string;
          targetLang?: string;
          targetLangName?: string;
          nativeLangName?: string;
          scenario?: string;
          student?: string;
        } | null;
        const text = (body?.text ?? "").trim();
        const targetLang = (body?.targetLang ?? "en").slice(0, 10);
        const targetLangName = (body?.targetLangName ?? "English").slice(0, 40);
        const nativeLangName = (body?.nativeLangName ?? "العربية").slice(0, 40);
        if (!text || text.length > 4000) return new Response("Invalid input", { status: 400 });

        const { data: prog } = await supabase
          .from("learning_progress")
          .select("level")
          .eq("user_id", userId)
          .eq("target_lang", targetLang)
          .maybeSingle();
        const level = prog?.level ?? "A1";

        // تفادي تكرار الرسالة عند إعادة المحاولة بعد انقطاع الشبكة
        const { data: lastMsg } = await supabase
          .from("chat_messages")
          .select("role, content")
          .eq("user_id", userId)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        const isDuplicate = lastMsg?.role === "user" && lastMsg?.content === text;
        if (!isDuplicate) {
          await supabase.from("chat_messages").insert({ user_id: userId, role: "user", content: text });
        }


        const { data: history } = await supabase
          .from("chat_messages")
          .select("role, content")
          .eq("user_id", userId)
          .order("created_at", { ascending: false })
          .limit(12);
        const ordered = (history ?? []).reverse();

        const upstream = await fetch(GATEWAY_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
          body: JSON.stringify({
            model: MODEL,
            stream: true,
            temperature: 0.6,
            max_completion_tokens: MAX_VOICE_TOKENS,
            messages: [
              {
                role: "system",
                content: voicePrompt(targetLangName, nativeLangName, level, body?.scenario, body?.student),
              },
              ...ordered.map((m) => ({ role: m.role, content: m.content })),
            ],
          }),
        });

        if (!upstream.ok || !upstream.body) {
          const detail = await upstream.text().catch(() => "");
          return new Response(detail || "AI error", { status: upstream.status || 500 });
        }

        // مرّر البثّ إلى المتصفح فوراً، واحفظ الردّ الكامل في النهاية
        const encoder = new TextEncoder();
        const decoder = new TextDecoder();
        let full = "";
        let sseBuf = "";
        const reader = upstream.body.getReader();

        const stream = new ReadableStream({
          async pull(controller) {
            const { done, value } = await reader.read();
            if (done) {
              if (full.trim()) {
                await supabase
                  .from("chat_messages")
                  .insert({ user_id: userId, role: "assistant", content: full.trim() });
              }
              controller.close();
              return;
            }
            const chunk = decoder.decode(value, { stream: true });
            sseBuf += chunk;
            const lines = sseBuf.split("\n");
            sseBuf = lines.pop() ?? "";
            for (const line of lines) {
              if (!line.startsWith("data: ")) continue;
              const payload = line.slice(6).trim();
              if (!payload || payload === "[DONE]") continue;
              try {
                const delta = JSON.parse(payload)?.choices?.[0]?.delta?.content;
                if (typeof delta === "string") full += delta;
              } catch {
                /* ignore partial frames */
              }
            }
            controller.enqueue(encoder.encode(chunk));
          },
          cancel() {
            void reader.cancel();
          },
        });

        return new Response(stream, {
          headers: {
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-cache",
            Connection: "keep-alive",
          },
        });
      },
    },
  },
});
