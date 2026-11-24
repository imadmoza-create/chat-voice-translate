import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { geminiGenerate, getGoogleApiKey, GOOGLE_TEXT_MODEL } from "@/lib/google-ai.server";

const json = (body: unknown, status = 200) => Response.json(body, { status });

function voicePrompt(
  langName: string,
  nativeName: string,
  level: string,
  scenario?: string,
  student?: string,
) {
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
      GET: async () => json({ configured: Boolean(getGoogleApiKey()) }),
      POST: async ({ request }) => {
        const auth = request.headers.get("authorization") ?? "";
        if (!auth.startsWith("Bearer ")) return json({ error: "UNAUTHORIZED" }, 401);
        const token = auth.slice(7);

        const SUPABASE_URL = process.env["SUPABASE_URL"];
        const SUPABASE_PUBLISHABLE_KEY = process.env["SUPABASE_PUBLISHABLE_KEY"];
        if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY)
          return json({ error: "SERVER_NOT_CONFIGURED" }, 500);
        if (!getGoogleApiKey()) return json({ error: "NO_GOOGLE_KEY" }, 503);

        const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
          global: { headers: { Authorization: `Bearer ${token}` } },
          auth: { persistSession: false, autoRefreshToken: false },
        });
        const { data: claimsData, error: claimsError } = await supabase.auth.getClaims(token);
        const userId = claimsData?.claims?.sub;
        if (claimsError || !userId) return json({ error: "UNAUTHORIZED" }, 401);

        const body = (await request.json().catch(() => null)) as {
          text?: string;
          targetLang?: string;
          targetLangName?: string;
          nativeLangName?: string;
          scenario?: string;
          student?: string;
          greeting?: boolean;
        } | null;
        const greeting = body?.greeting === true;
        const text = greeting ? "start the call" : (body?.text ?? "").trim();
        const targetLang = (body?.targetLang ?? "en").slice(0, 10);
        const targetLangName = (body?.targetLangName ?? "English").slice(0, 40);
        const nativeLangName = (body?.nativeLangName ?? "العربية").slice(0, 40);
        if (!text || text.length > 4000) return json({ error: "INVALID_INPUT" }, 400);

        const { data: prog } = await supabase
          .from("learning_progress")
          .select("level")
          .eq("user_id", userId)
          .eq("target_lang", targetLang)
          .maybeSingle();
        const level = prog?.level ?? "A1";

        const since = new Date(Date.now() - 60_000).toISOString();
        const { count: recentTurns, error: rateLimitError } = await supabase
          .from("chat_messages")
          .select("id", { count: "exact", head: true })
          .eq("user_id", userId)
          .eq("role", "user")
          .gte("created_at", since);
        if (rateLimitError) return json({ error: "RATE_LIMIT_CHECK_FAILED" }, 500);
        if ((recentTurns ?? 0) > 12) {
          return json(
            { error: "RATE_LIMIT", message: "المعلم مشغول الآن، حاول مرة أخرى بعد لحظة." },
            429,
          );
        }

        // تفادي تكرار الرسالة عند إعادة المحاولة بعد انقطاع الشبكة
        const { data: lastMsg } = await supabase
          .from("chat_messages")
          .select("role, content")
          .eq("user_id", userId)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        const isDuplicate = lastMsg?.role === "user" && lastMsg?.content === text;
        if (!isDuplicate && !greeting) {
          await supabase
            .from("chat_messages")
            .insert({ user_id: userId, role: "user", content: text });
        }

        const { data: history } = await supabase
          .from("chat_messages")
          .select("role, content")
          .eq("user_id", userId)
          .order("created_at", { ascending: false })
          .limit(12);

        const ordered = (history ?? [])
          .reverse()
          .map((m) => ({ role: m.role, content: m.content }));
        if (greeting) {
          ordered.push({
            role: "user",
            content: `(The call just started. Greet the student warmly in ${targetLangName} in one short sentence and ask one simple question.)`,
          });
        }

        let reply = "";
        try {
          reply = (
            await geminiGenerate(
              GOOGLE_TEXT_MODEL,
              [
                {
                  role: "system",
                  content:
                    voicePrompt(
                      targetLangName,
                      nativeLangName,
                      level,
                      body?.scenario?.slice(0, 2000),
                      body?.student?.slice(0, 2000),
                    ) + "\n- الطول: من جملة إلى ثلاث جمل قصيرة فقط.",
                },
                ...ordered,
              ],
              { fast: true },
            )
          ).trim();
        } catch (e) {
          const msg = e instanceof Error ? e.message : "";
          if (msg === "RATE_LIMIT")
            return json(
              { error: "RATE_LIMIT", message: "المعلم مشغول الآن، حاول مرة أخرى بعد لحظة." },
              429,
            );
          if (msg === "NO_GOOGLE_KEY") return json({ error: "NO_GOOGLE_KEY" }, 503);
          console.error(e);
          return json({ error: "AI_ERROR", message: "تعذّر الحصول على ردّ المعلم." }, 502);
        }
        if (!reply) return json({ error: "EMPTY_REPLY", message: "لم يصل ردّ من المعلم." }, 502);

        await supabase
          .from("chat_messages")
          .insert({ user_id: userId, role: "assistant", content: reply });

        // صيغة SSE متوافقة مع صفحة المحادثة النصية
        const sse = `data: ${JSON.stringify({ choices: [{ delta: { content: reply } }] })}\n\ndata: [DONE]\n\n`;
        return new Response(sse, {
          headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache" },
        });
      },
    },
  },
});
