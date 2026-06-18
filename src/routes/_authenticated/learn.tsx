import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useServerFn } from "@tanstack/react-start";
import { useAuth } from "@/hooks/useAuth";
import { speak, type VoiceGender } from "@/lib/speech";
import { WORD_CATEGORIES, PRONOUNS, type LearnItem } from "@/lib/learn";
import { LANGUAGES, langByCode } from "@/lib/languages";
import { translateBatch, translateText, type Conjugation } from "@/lib/translate.functions";
import { Button } from "@/components/ui/button";
import { Volume2, GraduationCap, Loader2, Trophy, RotateCcw, Check, X, Zap } from "lucide-react";

export const Route = createFileRoute("/_authenticated/learn")({
  head: () => ({ meta: [{ title: "تعلّم الكلمات والضمائر — ترجملي" }] }),
  component: LearnPage,
});

type Tab = "words" | "pronouns" | "mine" | "quiz";
type UserGender = "male" | "female";

// عرض نص العنصر باللغة الهدف
function itemText(item: LearnItem, lang: string, cache: Record<string, string>) {
  if (lang === "ar") return item.ar;
  if (lang === "en") return item.en;
  return cache[`${lang}:${item.en}`] ?? item.en;
}

function LearnCard({
  item, lang, cache, voiceGender,
}: { item: LearnItem; lang: string; cache: Record<string, string>; voiceGender: VoiceGender }) {
  const text = itemText(item, lang, cache);
  const bcp47 = langByCode(lang)?.bcp47 ?? "en-US";
  return (
    <div className="flex flex-col items-center gap-2 rounded-2xl border bg-card p-4 text-center shadow-card transition-transform hover:-translate-y-1">
      <div className="text-4xl leading-none">{item.emoji}</div>
      <div className="font-bold">{item.ar}</div>
      <div className="text-sm text-muted-foreground" dir="auto">{text}</div>
      <Button variant="secondary" size="sm" className="mt-1 rounded-xl gap-1.5" onClick={() => speak(text, bcp47, voiceGender)}>
        <Volume2 className="size-4" /> استمع
      </Button>
    </div>
  );
}

function LearnPage() {
  const { user } = useAuth();
  const runBatch = useServerFn(translateBatch);
  const [tab, setTab] = useState<Tab>("words");
  const [userGender, setUserGender] = useState<UserGender>("male");
  const [lang, setLang] = useState("en");
  const [activeCat, setActiveCat] = useState(WORD_CATEGORIES[0].id);
  const [mine, setMine] = useState<LearnItem[]>([]);
  const [loadingMine, setLoadingMine] = useState(false);
  const [cache, setCache] = useState<Record<string, string>>({});
  const [translating, setTranslating] = useState(false);

  // الصوت دائماً عكس جنس المستخدم
  const voiceGender: VoiceGender = userGender === "male" ? "female" : "male";

  const cat = WORD_CATEGORIES.find((c) => c.id === activeCat)!;

  // مجموعة العناصر المعروضة حالياً (للترجمة وللاختبار)
  const visibleItems: LearnItem[] = useMemo(() => {
    if (tab === "pronouns") return PRONOUNS;
    if (tab === "mine") return mine;
    return cat.items;
  }, [tab, cat, mine]);

  // كل العناصر المتاحة للاختبار
  const allItems: LearnItem[] = useMemo(
    () => [...WORD_CATEGORIES.flatMap((c) => c.items), ...PRONOUNS, ...mine],
    [mine],
  );

  useEffect(() => {
    if (tab !== "mine" || !user) return;
    setLoadingMine(true);
    supabase
      .from("translations")
      .select("source_text, translated_text")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(60)
      .then(({ data }) => {
        const seen = new Set<string>();
        const items: LearnItem[] = [];
        for (const r of data ?? []) {
          const en = (r.translated_text || "").trim();
          if (!en || en.split(/\s+/).length > 3 || seen.has(en.toLowerCase())) continue;
          seen.add(en.toLowerCase());
          items.push({ emoji: "📝", ar: (r.source_text || "").trim(), en });
        }
        setMine(items);
        setLoadingMine(false);
      });
  }, [tab, user]);

  // ترجمة العناصر للغة الهدف عند الحاجة
  useEffect(() => {
    if (lang === "ar" || lang === "en") return;
    const source = tab === "quiz" ? allItems : visibleItems;
    const missing = Array.from(new Set(source.map((i) => i.en))).filter((en) => !(`${lang}:${en}` in cache));
    if (missing.length === 0) return;
    setTranslating(true);
    const langName = langByCode(lang)?.name ?? lang;
    (async () => {
      const next: Record<string, string> = {};
      for (let i = 0; i < missing.length; i += 30) {
        const chunk = missing.slice(i, i + 30);
        try {
          const { translations } = await runBatch({ data: { words: chunk, targetLang: langName } });
          chunk.forEach((en, idx) => { next[`${lang}:${en}`] = translations[idx] ?? en; });
        } catch {
          chunk.forEach((en) => { next[`${lang}:${en}`] = en; });
        }
      }
      setCache((c) => ({ ...c, ...next }));
      setTranslating(false);
    })();
  }, [lang, tab, visibleItems, allItems]);

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-2">
        <GraduationCap className="size-6 text-primary" />
        <h1 className="text-2xl font-bold">تعلّم</h1>
      </div>

      <div className="grid grid-cols-4 gap-1 rounded-xl bg-muted p-1 text-sm font-medium">
        {(["words", "pronouns", "mine", "quiz"] as Tab[]).map((t) => (
          <button key={t} onClick={() => setTab(t)} className={`rounded-lg px-2 py-1.5 ${tab === t ? "bg-card shadow-sm" : "text-muted-foreground"}`}>
            {t === "words" ? "الكلمات" : t === "pronouns" ? "الضمائر" : t === "mine" ? "من سجلي" : "اختبار"}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
        <div className="flex items-center gap-2">
          <span className="text-muted-foreground">اللغة:</span>
          <select
            value={lang}
            onChange={(e) => setLang(e.target.value)}
            className="rounded-xl border bg-card px-3 py-1.5 font-medium"
          >
            {LANGUAGES.map((l) => (
              <option key={l.code} value={l.code}>{l.nameAr}</option>
            ))}
          </select>
          {translating && <Loader2 className="size-4 animate-spin text-primary" />}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-muted-foreground">جنسك:</span>
          <div className="flex items-center gap-1 rounded-xl bg-muted p-1">
            <button onClick={() => setUserGender("male")} className={`rounded-lg px-3 py-1 ${userGender === "male" ? "bg-card shadow-sm" : "text-muted-foreground"}`}>ذكر</button>
            <button onClick={() => setUserGender("female")} className={`rounded-lg px-3 py-1 ${userGender === "female" ? "bg-card shadow-sm" : "text-muted-foreground"}`}>أنثى</button>
          </div>
          <span className="text-xs text-muted-foreground">(صوت {voiceGender === "female" ? "مؤنث" : "مذكر"})</span>
        </div>
      </div>

      {tab === "words" && (
        <>
          <div className="flex flex-wrap gap-2">
            {WORD_CATEGORIES.map((c) => (
              <button key={c.id} onClick={() => setActiveCat(c.id)} className={`rounded-xl border px-3 py-1.5 text-sm font-medium ${activeCat === c.id ? "gradient-primary text-primary-foreground" : "bg-card text-muted-foreground"}`}>
                {c.emoji} {c.title}
              </button>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {cat.items.map((it) => <LearnCard key={it.en} item={it} lang={lang} cache={cache} voiceGender={voiceGender} />)}
          </div>
        </>
      )}

      {tab === "pronouns" && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {PRONOUNS.map((it) => <LearnCard key={it.en + it.ar} item={it} lang={lang} cache={cache} voiceGender={voiceGender} />)}
        </div>
      )}

      {tab === "mine" && (
        loadingMine ? (
          <div className="flex justify-center py-16"><Loader2 className="size-8 animate-spin text-primary" /></div>
        ) : mine.length === 0 ? (
          <div className="rounded-2xl border border-dashed bg-card py-16 text-center text-muted-foreground">لا توجد كلمات بعد — ابدأ بالترجمة وستظهر هنا للمراجعة.</div>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {mine.map((it, i) => <LearnCard key={it.en + i} item={it} lang={lang} cache={cache} voiceGender={voiceGender} />)}
          </div>
        )
      )}

      {tab === "quiz" && (
        <Quiz items={allItems} lang={lang} cache={cache} voiceGender={voiceGender} ready={!translating} />
      )}
    </div>
  );
}

type QuizQ = { item: LearnItem; options: string[]; correct: string };

function buildQuestions(items: LearnItem[], lang: string, cache: Record<string, string>): QuizQ[] {
  const pool = items.filter((i) => i.ar && itemText(i, lang, cache));
  // إزالة التكرار حسب النص الهدف
  const seen = new Set<string>();
  const uniq = pool.filter((i) => {
    const t = itemText(i, lang, cache).toLowerCase();
    if (seen.has(t)) return false;
    seen.add(t);
    return true;
  });
  const shuffled = [...uniq].sort(() => Math.random() - 0.5);
  return shuffled.map((item) => {
    const correct = itemText(item, lang, cache);
    const distractors = uniq
      .filter((d) => itemText(d, lang, cache) !== correct)
      .sort(() => Math.random() - 0.5)
      .slice(0, 3)
      .map((d) => itemText(d, lang, cache));
    const options = [correct, ...distractors].sort(() => Math.random() - 0.5);
    return { item, options, correct };
  });
}

function Quiz({
  items, lang, cache, voiceGender, ready,
}: { items: LearnItem[]; lang: string; cache: Record<string, string>; voiceGender: VoiceGender; ready: boolean }) {
  const [queue, setQueue] = useState<QuizQ[]>([]);
  const [idx, setIdx] = useState(0);
  const [score, setScore] = useState(0);
  const [total, setTotal] = useState(0);
  const [mistakes, setMistakes] = useState(0);
  const [picked, setPicked] = useState<string | null>(null);
  const [started, setStarted] = useState(false);
  const bcp47 = langByCode(lang)?.bcp47 ?? "en-US";

  const start = () => {
    const qs = buildQuestions(items, lang, cache);
    setQueue(qs);
    setIdx(0); setScore(0); setTotal(0); setMistakes(0); setPicked(null);
    setStarted(true);
  };

  const current = queue[idx];

  const choose = (opt: string) => {
    if (picked) return;
    setPicked(opt);
    setTotal((t) => t + 1);
    const correct = opt === current.correct;
    if (correct) {
      setScore((s) => s + 1);
    } else {
      setMistakes((m) => m + 1);
      // تكرار تلقائي للأخطاء: أعد إضافة السؤال لاحقاً
      setQueue((q) => {
        const copy = [...q];
        const insertAt = Math.min(copy.length, idx + 3);
        copy.splice(insertAt, 0, { ...current, options: [...current.options].sort(() => Math.random() - 0.5) });
        return copy;
      });
    }
    speak(current.correct, bcp47, voiceGender);
  };

  const next = () => {
    setPicked(null);
    setIdx((i) => i + 1);
  };

  if (!started) {
    return (
      <div className="rounded-2xl border bg-card p-8 text-center space-y-4">
        <Trophy className="mx-auto size-10 text-primary" />
        <p className="text-muted-foreground">اختبر معرفتك! اختر الترجمة الصحيحة للكلمة. الأخطاء تتكرر تلقائياً حتى تتقنها.</p>
        <Button onClick={start} disabled={!ready} className="rounded-xl gradient-primary text-primary-foreground">
          {ready ? "ابدأ الاختبار" : "جاري التحضير…"}
        </Button>
      </div>
    );
  }

  if (idx >= queue.length) {
    const pct = total ? Math.round((score / total) * 100) : 0;
    return (
      <div className="rounded-2xl border bg-card p-8 text-center space-y-4">
        <Trophy className="mx-auto size-12 text-primary" />
        <div className="text-3xl font-extrabold text-gradient">{pct}%</div>
        <p className="text-muted-foreground">أجبت {score} من {total} ({mistakes} خطأ مُكرّر)</p>
        <Button onClick={start} className="rounded-xl gap-1.5"><RotateCcw className="size-4" /> أعد الاختبار</Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between text-sm font-medium">
        <span>سؤال {idx + 1} / {queue.length}</span>
        <span className="text-primary">النتيجة: {score}</span>
      </div>
      <div className="rounded-2xl border bg-card p-6 text-center space-y-2">
        <div className="text-5xl">{current.item.emoji}</div>
        <div className="text-2xl font-bold">{current.item.ar}</div>
        <div className="text-xs text-muted-foreground">اختر الترجمة الصحيحة</div>
      </div>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {current.options.map((opt) => {
          const isCorrect = opt === current.correct;
          const show = picked !== null;
          const state = show && isCorrect ? "correct" : show && opt === picked ? "wrong" : "idle";
          return (
            <button
              key={opt}
              onClick={() => choose(opt)}
              dir="auto"
              className={`flex items-center justify-between rounded-xl border px-4 py-3 text-start font-medium transition-colors ${
                state === "correct" ? "border-primary bg-primary/10" :
                state === "wrong" ? "border-destructive bg-destructive/10" : "bg-card hover:bg-muted"
              }`}
            >
              {opt}
              {state === "correct" && <Check className="size-4 text-primary" />}
              {state === "wrong" && <X className="size-4 text-destructive" />}
            </button>
          );
        })}
      </div>
      {picked !== null && (
        <Button onClick={next} className="w-full rounded-xl gradient-primary text-primary-foreground">التالي</Button>
      )}
    </div>
  );
}
