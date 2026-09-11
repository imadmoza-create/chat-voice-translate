import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const GATEWAY_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";
const MODEL = "google/gemini-3-flash-preview";

async function callJson(system: string, user: string): Promise<any> {
  const key = process.env.LOVABLE_API_KEY;
  if (!key) throw new Error("Missing LOVABLE_API_KEY");
  const res = await fetch(GATEWAY_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model: MODEL,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    }),
  });
  if (res.status === 429) throw new Error("RATE_LIMIT");
  if (res.status === 402) throw new Error("CREDITS");
  if (!res.ok) throw new Error(`AI error ${res.status}`);
  const data = await res.json();
  let raw = String(data?.choices?.[0]?.message?.content ?? "").trim();
  const fence = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) raw = fence[1].trim();
  const s = raw.indexOf("{");
  const e = raw.lastIndexOf("}");
  if (s !== -1 && e !== -1) raw = raw.slice(s, e + 1);
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

const JSON_RULE = "Respond ONLY with a single strict JSON object, no markdown, no commentary.";

// ===================== توليد الدروس =====================
const LessonInput = z.object({
  level: z.string().min(2).max(3),
  theme: z.string().min(1).max(80),
  targetLang: z.string().min(2).max(40),
  nativeLang: z.string().min(2).max(40).optional(),
});

export const generateLesson = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => LessonInput.parse(i))
  .handler(async ({ data }) => {
    const nl = data.nativeLang ?? "Arabic";
    const sys = `You are an expert ${data.targetLang} teacher creating a CEFR ${data.level} lesson for an ${nl}-speaking learner. ${JSON_RULE}
Use this exact shape:
{"vocab":[{"word":"<word in ${data.targetLang}>","translation":"<${nl} meaning>","example":"<example sentence in ${data.targetLang}>","exampleTranslation":"<${nl} translation of the example>"}],
"grammar":{"title":"<grammar point title in ${nl}>","explanation":"<clear ${nl} explanation>","points":["<rule in ${nl} with a ${data.targetLang} example>"]},
"connectors":[{"word":"<connector word in ${data.targetLang}>","meaning":"<${nl} meaning>","example":"<short example in ${data.targetLang}>"}],
"phrases":[{"text":"<useful daily phrase in ${data.targetLang}>","translation":"<${nl} translation>"}]}
Give 14 vocab items, 4 grammar points, 6 connectors, 6 phrases. Vocabulary must match the topic and ${data.level} difficulty.`;
    const obj = await callJson(
      sys,
      `Topic (in ${nl}): ${data.theme}. Level: ${data.level}. Target language: ${data.targetLang}.`,
    );
    return {
      vocab: Array.isArray(obj.vocab) ? obj.vocab.slice(0, 20) : [],
      grammar: obj.grammar ?? { title: "", explanation: "", points: [] },
      connectors: Array.isArray(obj.connectors) ? obj.connectors.slice(0, 12) : [],
      phrases: Array.isArray(obj.phrases) ? obj.phrases.slice(0, 12) : [],
    };
  });

// ===================== الأفعال والتصريف =====================
const VerbsInput = z.object({
  level: z.string().min(2).max(3),
  category: z.string().min(1).max(60),
  targetLang: z.string().min(2).max(40),
  nativeLang: z.string().min(2).max(40).optional(),
});

export const generateVerbPack = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => VerbsInput.parse(i))
  .handler(async ({ data }) => {
    const nl = data.nativeLang ?? "Arabic";
    const sys = `You are a ${data.targetLang} verb expert teaching an ${nl} speaker at CEFR ${data.level}. ${JSON_RULE}
Shape:
{"verbs":[{"infinitive":"<verb in ${data.targetLang}>","translation":"<${nl} meaning>","type":"<one of: عادي|منعكس|مركّب|شاذ>","tenses":[{"tense":"<tense name in ${nl}>","forms":[{"pronoun":"<pronoun in ${data.targetLang}>","form":"<conjugated form>"}],"example":"<example sentence in ${data.targetLang}> — <${nl} translation>"}]}]}
Return 6 verbs of the requested category. For each verb include 3 important tenses (present, past, future or the most relevant), each with full person conjugation.`;
    const obj = await callJson(
      sys,
      `Verb category (${nl}): ${data.category}. Level: ${data.level}. Language: ${data.targetLang}.`,
    );
    return { verbs: Array.isArray(obj.verbs) ? obj.verbs.slice(0, 10) : [] };
  });

// ===================== التمارين =====================
const ExerciseInput = z.object({
  level: z.string().min(2).max(3),
  theme: z.string().min(1).max(80),
  targetLang: z.string().min(2).max(40),
  nativeLang: z.string().min(2).max(40).optional(),
  type: z.enum(["listening", "writing", "speaking", "grammar"]),
});

export const generateExercise = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => ExerciseInput.parse(i))
  .handler(async ({ data }) => {
    const nl = data.nativeLang ?? "Arabic";
    let shape = "";
    if (data.type === "listening") {
      shape = `{"items":[{"audioText":"<sentence in ${data.targetLang} to be heard>","prompt":"<comprehension question in ${nl}>","options":["<opt in ${data.targetLang} or ${nl}>"],"correct":"<correct option>"}]}  (6 items)`;
    } else if (data.type === "grammar") {
      shape = `{"items":[{"prompt":"<fill-in / choose question in ${data.targetLang}>","options":["..."],"correct":"<correct option>","explanation":"<${nl} explanation>"}]}  (8 items)`;
    } else {
      // writing / speaking
      shape = `{"items":[{"task":"<task instruction in ${nl}>","sample":"<model answer in ${data.targetLang}>","sampleTranslation":"<${nl} translation>"}]}  (5 items)`;
    }
    const sys = `You build CEFR ${data.level} ${data.type} exercises in ${data.targetLang} for an ${nl} speaker. ${JSON_RULE} Shape: ${shape}`;
    const obj = await callJson(
      sys,
      `Topic (${nl}): ${data.theme}. Level: ${data.level}. Type: ${data.type}. Language: ${data.targetLang}.`,
    );
    return { items: Array.isArray(obj.items) ? obj.items.slice(0, 10) : [] };
  });

// ===================== اختبار المستوى =====================
const TestInput = z.object({
  level: z.string().min(2).max(3),
  targetLang: z.string().min(2).max(40),
  nativeLang: z.string().min(2).max(40).optional(),
});

export const generateLevelTest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => TestInput.parse(i))
  .handler(async ({ data }) => {
    const nl = data.nativeLang ?? "Arabic";
    const sys = `Create a CEFR ${data.level} mixed test in ${data.targetLang} for an ${nl} speaker. ${JSON_RULE}
Shape: {"questions":[{"skill":"<one of: مفردات|قواعد|استماع|قراءة>","prompt":"<question, may be in ${data.targetLang}>","options":["..."],"correct":"<exact correct option>"}]}
Return 15 multiple-choice questions covering vocabulary, grammar, reading and listening comprehension at ${data.level}.`;
    const obj = await callJson(sys, `Level: ${data.level}. Language: ${data.targetLang}.`);
    return { questions: Array.isArray(obj.questions) ? obj.questions.slice(0, 20) : [] };
  });

// ===================== اختبار تحديد المستوى =====================
const PlacementInput = z.object({
  targetLang: z.string().min(2).max(40),
  nativeLang: z.string().min(2).max(40).optional(),
});

export const placementTest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => PlacementInput.parse(i))
  .handler(async ({ data }) => {
    const nl = data.nativeLang ?? "Arabic";
    const sys = `Create a placement test in ${data.targetLang} for an ${nl} speaker to find their CEFR level. ${JSON_RULE}
Shape: {"questions":[{"level":"<A1|A2|B1|B2>","prompt":"<question in ${data.targetLang}>","options":["..."],"correct":"<exact correct option>"}]}
Return 16 multiple-choice questions, 4 per level from A1 (easiest) to B2 (hardest), ordered by increasing difficulty.`;
    const obj = await callJson(sys, `Language: ${data.targetLang}.`);
    return { questions: Array.isArray(obj.questions) ? obj.questions.slice(0, 20) : [] };
  });

// ===================== الخطة اليومية =====================
export const generateDailyPlan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => TestInput.parse(i))
  .handler(async ({ data }) => {
    const nl = data.nativeLang ?? "Arabic";
    const sys = `You are a language coach. Build a focused daily study plan to progress toward B2 in ${data.targetLang} for an ${nl} speaker currently at ${data.level}. ${JSON_RULE}
Shape: {"summary":"<one motivating ${nl} sentence>","tasks":[{"title":"<task in ${nl}>","skill":"<مفردات|قواعد|استماع|كتابة|تحدّث|مراجعة>","minutes":<number>}]}
Return 6 tasks totaling about 45 minutes.`;
    const obj = await callJson(sys, `Current level: ${data.level}. Language: ${data.targetLang}.`);
    return {
      summary: String(obj.summary ?? ""),
      tasks: Array.isArray(obj.tasks) ? obj.tasks.slice(0, 10) : [],
    };
  });

// ===================== حوار محادثة =====================
const DialogueInput = z.object({
  level: z.string().min(2).max(3),
  targetLang: z.string().min(2).max(40),
  nativeLang: z.string().min(2).max(40).optional(),
  scenario: z.string().min(1).max(80),
});

export const generateDialogue = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => DialogueInput.parse(i))
  .handler(async ({ data }) => {
    const nl = data.nativeLang ?? "Arabic";
    const sys = `Write a natural CEFR ${data.level} dialogue in ${data.targetLang} for an ${nl} learner. ${JSON_RULE}
Shape: {"title":"<title in ${nl}>","lines":[{"speaker":"<A or B>","text":"<line in ${data.targetLang}>","translation":"<${nl} translation>"}]}
Return 10 lines about the given scenario.`;
    const obj = await callJson(
      sys,
      `Scenario (${nl}): ${data.scenario}. Level: ${data.level}. Language: ${data.targetLang}.`,
    );
    return {
      title: String(obj.title ?? data.scenario),
      lines: Array.isArray(obj.lines) ? obj.lines.slice(0, 16) : [],
    };
  });

// ===================== التقدّم =====================
export const getProgress = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ targetLang: z.string().min(2).max(40) }).parse(i))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    let { data: row } = await supabase
      .from("learning_progress")
      .select("level, xp, streak, last_active_date, completed_themes")
      .eq("user_id", userId)
      .eq("target_lang", data.targetLang)
      .maybeSingle();
    if (!row) {
      const { data: created } = await supabase
        .from("learning_progress")
        .insert({ user_id: userId, target_lang: data.targetLang })
        .select("level, xp, streak, last_active_date, completed_themes")
        .single();
      row = created;
    }
    return row ?? { level: "A1", xp: 0, streak: 0, last_active_date: null, completed_themes: [] };
  });

const UpdateProgressInput = z.object({
  targetLang: z.string().min(2).max(40),
  level: z.string().min(2).max(3).optional(),
  addXp: z.number().int().min(0).max(1000).optional(),
  completeTheme: z.string().max(60).optional(),
});

export const updateProgress = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => UpdateProgressInput.parse(i))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: cur } = await supabase
      .from("learning_progress")
      .select("level, xp, streak, last_active_date, completed_themes")
      .eq("user_id", userId)
      .eq("target_lang", data.targetLang)
      .maybeSingle();

    const today = new Date().toISOString().slice(0, 10);
    let streak = cur?.streak ?? 0;
    if (cur?.last_active_date !== today) {
      const y = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
      streak = cur?.last_active_date === y ? streak + 1 : 1;
    }
    const themes = new Set<string>(cur?.completed_themes ?? []);
    if (data.completeTheme) themes.add(data.completeTheme);

    const payload = {
      user_id: userId,
      target_lang: data.targetLang,
      level: data.level ?? cur?.level ?? "A1",
      xp: (cur?.xp ?? 0) + (data.addXp ?? 0),
      streak,
      last_active_date: today,
      completed_themes: Array.from(themes),
    };
    const { data: row, error } = await supabase
      .from("learning_progress")
      .upsert(payload, { onConflict: "user_id,target_lang" })
      .select("level, xp, streak, last_active_date, completed_themes")
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

// ===================== المراجعة الذكية (التكرار المتباعد) =====================
const AddReviewsInput = z.object({
  lang: z.string().min(2).max(40),
  level: z.string().min(2).max(3),
  words: z
    .array(z.object({ word: z.string().min(1).max(120), translation: z.string().min(1).max(200) }))
    .min(1)
    .max(40),
});

export const addReviews = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => AddReviewsInput.parse(i))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const rows = data.words.map((w) => ({
      user_id: userId,
      lang: data.lang,
      level: data.level,
      word: w.word,
      translation: w.translation,
    }));
    const { error } = await supabase
      .from("vocab_reviews")
      .upsert(rows, { onConflict: "user_id,lang,word", ignoreDuplicates: true });
    if (error) throw new Error(error.message);
    return { added: rows.length };
  });

export const getDueReviews = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ lang: z.string().min(2).max(40) }).parse(i))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: rows } = await supabase
      .from("vocab_reviews")
      .select("id, word, translation, level, reps, ease, interval_days")
      .eq("user_id", userId)
      .eq("lang", data.lang)
      .lte("due_at", new Date().toISOString())
      .order("due_at", { ascending: true })
      .limit(20);
    return { reviews: rows ?? [] };
  });

// SM-2 مبسّط: quality 0..5 (نضع: صحيح=4، خطأ=1)
const GradeInput = z.object({
  id: z.string().uuid(),
  correct: z.boolean(),
});

export const gradeReview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => GradeInput.parse(i))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: row } = await supabase
      .from("vocab_reviews")
      .select("ease, interval_days, reps")
      .eq("id", data.id)
      .eq("user_id", userId)
      .single();
    if (!row) throw new Error("not found");

    const q = data.correct ? 4 : 1;
    let ease = row.ease + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02));
    if (ease < 1.3) ease = 1.3;
    let reps = row.reps;
    let interval: number;
    if (!data.correct) {
      reps = 0;
      interval = 0.007; // ~10 دقائق
    } else {
      reps += 1;
      interval = reps === 1 ? 1 : reps === 2 ? 3 : Math.round(row.interval_days * ease);
      if (interval < 1) interval = 1;
    }
    const due = new Date(Date.now() + interval * 86400000).toISOString();
    const { error } = await supabase
      .from("vocab_reviews")
      .update({ ease, interval_days: interval, reps, due_at: due })
      .eq("id", data.id)
      .eq("user_id", userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
