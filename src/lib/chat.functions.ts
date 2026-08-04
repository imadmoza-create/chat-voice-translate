import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const GATEWAY_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";
const STT_URL = "https://ai.gateway.lovable.dev/v1/audio/transcriptions";
const MODEL = "google/gemini-3-flash-preview";
const STT_MODEL = "openai/gpt-4o-mini-transcribe";

const VALID_LEVELS = ["A1", "A2", "B1", "B2", "C1", "C2"];

export type ChatMessage = { id: string; role: "user" | "assistant"; content: string; created_at: string };

export type Correction = {
  original: string;
  corrected: string;
  reason: string;
  rule: string;
  examples: string[];
  explanation: string;
};

export type TutorReply = {
  reply: string;
  translation: string;
  correction: Correction | null;
  level: string;
  xp: number;
};

function buildSystemPrompt(langName: string, nativeName: string, level: string, scenario?: string, student?: string) {
  const scenarioLine = scenario ? `\nموضوع/سيناريو هذه الجلسة: ${scenario}\nالتزم بهذا السيناريو والعب دورك بواقعية، وحافظ على استمرار الموقف.` : "";
  const studentLine = student
    ? `\nمعلومات الطالب الشخصية: ${student}\nخصّص المحادثة والأمثلة والتمارين حسب اسمه وعمره وعمله وحياته، ونادِه باسمه، واجعل المواضيع قريبة من واقعه واهتماماته.`
    : "";
  return `أنت "المعلم الذكي" — مدرّس ${langName} ودود وسريع البديهة وطبيعي، تتحدّث مع طالب ناطق بـ${nativeName} كما يفعل مدرّس بشري حقيقي.
اللغة الهدف للتعليم الآن هي ${langName} فقط، ولغة الطالب الأم هي ${nativeName}. إذا غيّر الطالب لغته الهدف في الإعدادات، تحوّل فوراً للتدريس والتفاعل بمفردات وأمثلة اللغة الجديدة دون العودة لأي لغة سابقة.
مستوى الطالب الحالي: ${level} (حسب الإطار الأوروبي CEFR).${scenarioLine}${studentLine}

قواعد سلوكك:
1) الشخصية والنبرة: مشجّع، دافئ، طبيعي ومختصر. لا تبدُ أبداً كموسوعة أو روبوت.
2) السرعة والاختصار: اجعل الردّ قصيراً جداً (جملة إلى ثلاث جمل كحدّ أقصى) ليتحدّث الطالب أكثر. ممنوع المحاضرات الطويلة.
3) توازن اللغة: تحدّث أساساً بلغة ${langName} بمستوى مناسب لـ ${level}. استخدم ${nativeName} فقط لشرح قاعدة صعبة أو ملاحظة مهمة أو حين يسألك الطالب بـ${nativeName}.
4) تفاعل دائم: أنهِ كل ردّ بسؤال قصير وبسيط أو تحدٍّ سريع ليستمر الحوار طبيعياً.
5) تصحيح لطيف: إن أخطأ الطالب في القواعد أو النطق، صحّح فوراً بشكل خفيف وسريع ثم تابع الحديث. مثال: "أحسنت! فقط تذكّر أنها 'Come ti chiami?' وليس 'Come ti chiama?'. والآن، من أين أنت؟"
6) قابلية المقاطعة: توقّع أن يقاطعك الطالب. إذا جاءت رسالة جديدة، توقّف فوراً عمّا كنت تشرحه وتعامل مع مدخله الجديد مباشرة.
7) تذكّر ما قاله الطالب سابقاً في هذه المحادثة وابنِ عليه.
8) قيّم مستوى الطالب باستمرار وعدّله (level) صعوداً أو نزولاً حسب أدائه.
9) امنح نقاط خبرة (xp) بين 3 و15 حسب جودة مشاركة الطالب.

أجب حصراً بكائن JSON صارم بدون أي نص إضافي أو Markdown، بالشكل التالي:
{"reply":"<ردّك بلغة ${langName}>","translation":"<ترجمة كاملة للردّ بـ${nativeName}>","correction":{"original":"<جملة الطالب الخاطئة كما كتبها>","corrected":"<الجملة الصحيحة بلغة ${langName}>","reason":"<سبب الخطأ بـ${nativeName} بإيجاز، مثل: خطأ في زمن الفعل / ترتيب الكلمات / حرف جر>","rule":"<قاعدة نحوية مختصرة بـ${nativeName} توضّح الصواب>","examples":["<مثال بديل صحيح بلغة ${langName}>","<مثال بديل آخر صحيح بلغة ${langName}>"],"explanation":"<شرح إضافي مبسّط بـ${nativeName}>"} أو null إذا لا يوجد خطأ,"level":"<A1|A2|B1|B2|C1>","xp":<رقم>}
اجعل حقل examples يحتوي على مثالين إلى ثلاثة أمثلة قصيرة صحيحة بلغة ${langName} يمكن للطالب استخدامها مباشرة.`;
}

function extractJson(content: string): any {
  let raw = content.trim();
  const fence = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) raw = fence[1].trim();
  const s = raw.indexOf("{");
  const e = raw.lastIndexOf("}");
  if (s !== -1 && e !== -1) raw = raw.slice(s, e + 1);
  try {
    return JSON.parse(raw);
  } catch {
    return { reply: content.trim(), translation: "", correction: null };
  }
}

export const getChatMessages = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<ChatMessage[]> => {
    const { data, error } = await context.supabase
      .from("chat_messages")
      .select("id, role, content, created_at")
      .eq("user_id", context.userId)
      .order("created_at", { ascending: true })
      .limit(200);
    if (error) throw new Error(error.message);
    return (data ?? []) as ChatMessage[];
  });

export const clearChat = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { error } = await context.supabase
      .from("chat_messages")
      .delete()
      .eq("user_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const sendChatMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        text: z.string().min(1).max(4000),
        targetLang: z.string().min(2).max(10),
        targetLangName: z.string().min(2).max(40),
        nativeLangName: z.string().min(2).max(40).optional(),
        scenario: z.string().max(400).optional(),
        student: z.string().max(600).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<TutorReply> => {
    const key = process.env.LOVABLE_API_KEY;
    if (!key) throw new Error("Missing LOVABLE_API_KEY");

    // مستوى الطالب الحالي لهذه اللغة
    const { data: prog } = await context.supabase
      .from("learning_progress")
      .select("level")
      .eq("user_id", context.userId)
      .eq("target_lang", data.targetLang)
      .maybeSingle();
    const curLevel = prog?.level ?? "A1";

    // احفظ رسالة الطالب
    await context.supabase
      .from("chat_messages")
      .insert({ user_id: context.userId, role: "user", content: data.text });

    // سياق المحادثة
    const { data: history } = await context.supabase
      .from("chat_messages")
      .select("role, content")
      .eq("user_id", context.userId)
      .order("created_at", { ascending: false })
      .limit(20);
    const ordered = (history ?? []).reverse();

    const messages = [
      { role: "system", content: buildSystemPrompt(data.targetLangName, data.nativeLangName ?? "العربية", curLevel, data.scenario, data.student) },
      ...ordered.map((m) => ({ role: m.role, content: m.content })),
    ];

    const res = await fetch(GATEWAY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({ model: MODEL, messages }),
    });
    if (res.status === 429) throw new Error("RATE_LIMIT");
    if (res.status === 402) throw new Error("CREDITS");
    if (!res.ok) throw new Error(`AI error ${res.status}`);
    const json = await res.json();
    const obj = extractJson(String(json?.choices?.[0]?.message?.content ?? ""));

    const reply = String(obj?.reply ?? "").trim() || "…";
    const translation = String(obj?.translation ?? "").trim();
    const correction: Correction | null =
      obj?.correction && typeof obj.correction === "object" && obj.correction.corrected
        ? {
            original: String(obj.correction.original ?? ""),
            corrected: String(obj.correction.corrected),
            reason: String(obj.correction.reason ?? ""),
            rule: String(obj.correction.rule ?? ""),
            examples: Array.isArray(obj.correction.examples)
              ? obj.correction.examples.map((x: any) => String(x)).filter(Boolean).slice(0, 4)
              : [],
            explanation: String(obj.correction.explanation ?? ""),
          }
        : null;
    const level = VALID_LEVELS.includes(obj?.level) ? String(obj.level) : curLevel;
    const xp = Math.max(0, Math.min(20, Number(obj?.xp) || 5));

    // احفظ ردّ المدرّس
    await context.supabase
      .from("chat_messages")
      .insert({ user_id: context.userId, role: "assistant", content: reply });

    // حدّث تقدّم الطالب (المستوى + الخبرة)
    const today = new Date().toISOString().slice(0, 10);
    const { data: cur } = await context.supabase
      .from("learning_progress")
      .select("xp, streak, last_active_date")
      .eq("user_id", context.userId)
      .eq("target_lang", data.targetLang)
      .maybeSingle();
    let streak = cur?.streak ?? 0;
    if (cur?.last_active_date !== today) {
      const y = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
      streak = cur?.last_active_date === y ? streak + 1 : 1;
    }
    await context.supabase.from("learning_progress").upsert(
      {
        user_id: context.userId,
        target_lang: data.targetLang,
        level,
        xp: (cur?.xp ?? 0) + xp,
        streak,
        last_active_date: today,
      },
      { onConflict: "user_id,target_lang" },
    );

    return { reply, translation, correction, level, xp };
  });

// ===================== تحويل الصوت إلى نص =====================
export const transcribeAudio = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        audio: z.string().min(10).max(12_000_000), // data URL
        mime: z.string().max(60).optional(),
        lang: z.string().max(10).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data }): Promise<{ text: string }> => {
    const key = process.env.LOVABLE_API_KEY;
    if (!key) throw new Error("Missing LOVABLE_API_KEY");

    const base64 = data.audio.includes(",") ? data.audio.split(",")[1] : data.audio;
    const bin = atob(base64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);

    const mime = (data.mime || "audio/webm").split(";")[0];
    const ext =
      ({ "audio/webm": "webm", "audio/mp4": "mp4", "audio/mpeg": "mp3", "audio/wav": "wav", "audio/ogg": "ogg" } as Record<string, string>)[
        mime
      ] ?? "webm";

    const form = new FormData();
    form.append("model", STT_MODEL);
    form.append("file", new Blob([bytes], { type: mime }), `recording.${ext}`);
    if (data.lang) form.append("language", data.lang);

    const res = await fetch(STT_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}` },
      body: form,
    });
    if (res.status === 429) throw new Error("RATE_LIMIT");
    if (res.status === 402) throw new Error("CREDITS");
    if (!res.ok) throw new Error(`STT error ${res.status}`);
    const json = await res.json();
    return { text: String(json?.text ?? "").trim() };
  });

// ===================== تقييم المحادثة النهائي =====================
export type ConversationScore = {
  pronunciation: number;
  grammar: number;
  vocabulary: number;
  fluency: number;
  overall: number;
  level: string;
  feedback: string;
  strengths: string[];
  improvements: string[];
};

export const assessConversation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        targetLang: z.string().min(2).max(10),
        targetLangName: z.string().min(2).max(40),
        nativeLangName: z.string().min(2).max(40).optional(),
        pronunciationScore: z.number().min(0).max(100).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<ConversationScore> => {
    const key = process.env.LOVABLE_API_KEY;
    if (!key) throw new Error("Missing LOVABLE_API_KEY");

    const { data: history } = await context.supabase
      .from("chat_messages")
      .select("role, content")
      .eq("user_id", context.userId)
      .order("created_at", { ascending: true })
      .limit(100);
    const ordered = history ?? [];
    const userTurns = ordered.filter((m) => m.role === "user");

    const { data: prog } = await context.supabase
      .from("learning_progress")
      .select("level")
      .eq("user_id", context.userId)
      .eq("target_lang", data.targetLang)
      .maybeSingle();
    const curLevel = prog?.level ?? "A1";

    const transcript = ordered
      .map((m) => `${m.role === "user" ? "الطالب" : "المدرّس"}: ${m.content}`)
      .join("\n");

    const sys = `أنت مقيّم لغوي خبير. قيّم أداء الطالب الناطق بـ${data.nativeLangName ?? "العربية"} في محادثة بلغة ${data.targetLangName} (مستواه الحالي ${curLevel}).
اعتمد فقط على رسائل الطالب. أعطِ درجات من 0 إلى 100 لكل من: القواعد (grammar)، المفردات (vocabulary)، الطلاقة (fluency)، والنطق (pronunciation).
${data.pronunciationScore !== undefined ? `درجة النطق المقاسة فعلياً من تدريبات الصوت هي ${Math.round(data.pronunciationScore)} فاعتمدها كمرجع أساسي للنطق.` : "قدّر النطق تقديرياً من جودة الكتابة إذ لا توجد قياسات صوتية."}
أجب حصراً بكائن JSON صارم بدون أي نص إضافي:
{"pronunciation":<رقم>,"grammar":<رقم>,"vocabulary":<رقم>,"fluency":<رقم>,"overall":<رقم متوسط>,"level":"<A1|A2|B1|B2|C1|C2>","feedback":"<ملخص تشجيعي بالعربية>","strengths":["<نقطة قوة بالعربية>"],"improvements":["<نقطة للتحسين بالعربية>"]}`;

    const res = await fetch(GATEWAY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          { role: "system", content: sys },
          { role: "user", content: transcript || "لا توجد رسائل." },
        ],
      }),
    });
    if (res.status === 429) throw new Error("RATE_LIMIT");
    if (res.status === 402) throw new Error("CREDITS");
    if (!res.ok) throw new Error(`AI error ${res.status}`);
    const json = await res.json();
    const obj = extractJson(String(json?.choices?.[0]?.message?.content ?? ""));

    const clamp = (v: any, d = 0) => Math.max(0, Math.min(100, Math.round(Number(v) || d)));
    const pronunciation = data.pronunciationScore !== undefined ? Math.round(data.pronunciationScore) : clamp(obj?.pronunciation);
    const grammar = clamp(obj?.grammar);
    const vocabulary = clamp(obj?.vocabulary);
    const fluency = clamp(obj?.fluency);
    const overall = clamp(obj?.overall, Math.round((pronunciation + grammar + vocabulary + fluency) / 4));
    const level = VALID_LEVELS.includes(obj?.level) ? String(obj.level) : curLevel;

    return {
      pronunciation,
      grammar,
      vocabulary,
      fluency,
      overall,
      level,
      feedback: String(obj?.feedback ?? "").trim() || "أحسنت! استمر في التدرّب.",
      strengths: Array.isArray(obj?.strengths) ? obj.strengths.map((x: any) => String(x)).filter(Boolean).slice(0, 5) : [],
      improvements: Array.isArray(obj?.improvements) ? obj.improvements.map((x: any) => String(x)).filter(Boolean).slice(0, 5) : [],
    };
  });
