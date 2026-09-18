import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { LazyList } from "@/components/LazyList";
import { usePersistedState } from "@/lib/persisted-state";
import { supabase } from "@/integrations/supabase/client";
import { useServerFn } from "@tanstack/react-start";
import { useAuth } from "@/hooks/useAuth";
import { speak, type VoiceGender } from "@/lib/speech";
import { useAppLang, useUserGender } from "@/lib/prefs";
import { WORD_CATEGORIES, PRONOUNS, type LearnItem } from "@/lib/learn";
import { langByCode } from "@/lib/languages";
import { translateBatch, translateText, type Conjugation } from "@/lib/translate.functions";
import { Button } from "@/components/ui/button";
import {
  Volume2,
  GraduationCap,
  Loader2,
  Trophy,
  RotateCcw,
  Check,
  X,
  Zap,
  Settings,
} from "lucide-react";

export const Route = createFileRoute("/_authenticated/learn")({
  head: () => ({ meta: [{ title: "تعلّم الكلمات والضمائر — ترجملي" }] }),
  component: LearnPage,
});

type Tab = "words" | "pronouns" | "verbs" | "mine" | "quiz";

// عرض نص العنصر باللغة الهدف
function itemText(item: LearnItem, lang: string, cache: Record<string, string>) {
  if (lang === "ar") return item.ar;
  if (lang === "en") return item.en;
  return cache[`${lang}:${item.en}`] ?? item.en;
}

function LearnCard({
  item,
  lang,
  cache,
  voiceGender,
}: {
  item: LearnItem;
  lang: string;
  cache: Record<string, string>;
  voiceGender: VoiceGender;
}) {
  const text = itemText(item, lang, cache);
  const bcp47 = langByCode(lang)?.bcp47 ?? "en-US";
  return (
    <div className="flex flex-col items-center gap-2 rounded-2xl border bg-card p-4 text-center shadow-card transition-transform hover:-translate-y-1">
      <div className="text-4xl leading-none">{item.emoji}</div>
      <div className="font-bold">{item.ar}</div>
      <div className="text-sm text-muted-foreground" dir="auto">
        {text}
      </div>
      {item.note && (
        <div className="w-full rounded-lg bg-muted px-2.5 py-2 text-xs leading-5 text-muted-foreground">
          {item.note}
        </div>
      )}
      <Button
        variant="secondary"
        size="sm"
        className="mt-1 rounded-xl gap-1.5"
        onClick={() => speak(text, bcp47, voiceGender)}
      >
        <Volume2 className="size-4" /> استمع
      </Button>
    </div>
  );
}

function LearnPage() {
  const { user } = useAuth();
  const runBatch = useServerFn(translateBatch);
  const [tab, setTab] = usePersistedState<Tab>("learn_tab", "words");
  const [userGender] = useUserGender();
  const [lang] = useAppLang();
  const [activeCat, setActiveCat] = usePersistedState<string>("learn_cat", WORD_CATEGORIES[0].id);
  const [mine, setMine] = useState<LearnItem[]>([]);
  const [loadingMine, setLoadingMine] = useState(false);
  const [cache, setCache] = useState<Record<string, string>>({});
  const [translating, setTranslating] = useState(false);

  // الصوت دائماً عكس جنس المستخدم
  const voiceGender: VoiceGender = userGender === "male" ? "female" : "male";

  const cat = WORD_CATEGORIES.find((c) => c.id === activeCat) ?? WORD_CATEGORIES[0];

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
    const missing = Array.from(new Set(source.map((i) => i.en))).filter(
      (en) => !(`${lang}:${en}` in cache),
    );
    if (missing.length === 0) return;
    setTranslating(true);
    const langName = langByCode(lang)?.name ?? lang;
    (async () => {
      const next: Record<string, string> = {};
      for (let i = 0; i < missing.length; i += 30) {
        const chunk = missing.slice(i, i + 30);
        try {
          const { translations } = await runBatch({ data: { words: chunk, targetLang: langName } });
          chunk.forEach((en, idx) => {
            next[`${lang}:${en}`] = translations[idx] ?? en;
          });
        } catch {
          chunk.forEach((en) => {
            next[`${lang}:${en}`] = en;
          });
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

      <div className="grid grid-cols-5 gap-1 rounded-xl bg-muted p-1 text-xs font-medium sm:text-sm">
        {(["words", "pronouns", "verbs", "mine", "quiz"] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`rounded-lg px-1.5 py-1.5 ${tab === t ? "bg-card shadow-sm" : "text-muted-foreground"}`}
          >
            {t === "words"
              ? "الكلمات"
              : t === "pronouns"
                ? "الضمائر"
                : t === "verbs"
                  ? "الأفعال"
                  : t === "mine"
                    ? "سجلي"
                    : "اختبار"}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-card px-3 py-2 text-sm">
        <div className="flex items-center gap-2">
          <span className="text-muted-foreground">اللغة:</span>
          <span className="font-bold">{langByCode(lang)?.nameAr ?? lang}</span>
          {translating && <Loader2 className="size-4 animate-spin text-primary" />}
          <span className="text-xs text-muted-foreground">
            · صوت {voiceGender === "female" ? "مؤنث" : "مذكر"}
          </span>
        </div>
        <Link to="/settings">
          <Button variant="ghost" size="sm" className="rounded-xl gap-1.5">
            <Settings className="size-4" /> تغيير اللغة
          </Button>
        </Link>
      </div>

      {tab === "words" && (
        <>
          <div className="flex flex-wrap gap-2">
            {WORD_CATEGORIES.map((c) => (
              <button
                key={c.id}
                onClick={() => setActiveCat(c.id)}
                className={`rounded-xl border px-3 py-1.5 text-sm font-medium ${activeCat === c.id ? "gradient-primary text-primary-foreground" : "bg-card text-muted-foreground"}`}
              >
                {c.emoji} {c.title}
              </button>
            ))}
          </div>
          <LazyList
            className="grid grid-cols-2 gap-3 sm:grid-cols-3"
            items={cat.items}
            keyOf={(it) => it.en}
            renderItem={(it) => (
              <LearnCard item={it} lang={lang} cache={cache} voiceGender={voiceGender} />
            )}
          />
        </>
      )}

      {tab === "pronouns" && (
        <LazyList
          className="grid grid-cols-2 gap-3 sm:grid-cols-3"
          items={PRONOUNS}
          keyOf={(it) => it.en + it.ar}
          renderItem={(it) => (
            <LearnCard item={it} lang={lang} cache={cache} voiceGender={voiceGender} />
          )}
        />
      )}

      {tab === "mine" &&
        (loadingMine ? (
          <div className="flex justify-center py-16">
            <Loader2 className="size-8 animate-spin text-primary" />
          </div>
        ) : mine.length === 0 ? (
          <div className="rounded-2xl border border-dashed bg-card py-16 text-center text-muted-foreground">
            لا توجد كلمات بعد — ابدأ بالترجمة وستظهر هنا للمراجعة.
          </div>
        ) : (
          <LazyList
            className="grid grid-cols-2 gap-3 sm:grid-cols-3"
            items={mine}
            keyOf={(it, i) => it.en + i}
            renderItem={(it) => (
              <LearnCard item={it} lang={lang} cache={cache} voiceGender={voiceGender} />
            )}
          />
        ))}

      {tab === "verbs" && <VerbTrainer lang={lang} voiceGender={voiceGender} />}

      {tab === "quiz" && (
        <Quiz
          items={allItems}
          mine={mine}
          lang={lang}
          cache={cache}
          voiceGender={voiceGender}
          ready={!translating}
        />
      )}
    </div>
  );
}

const COMMON_VERBS = [
  "يأكل",
  "يشرب",
  "يذهب",
  "يكتب",
  "يقرأ",
  "يتكلم",
  "ينام",
  "يلعب",
  "يعمل",
  "يحب",
  "يرى",
  "يأتي",
  "يفهم",
  "يسأل",
  "يجيب",
  "يفتح",
  "يغلق",
  "يشتري",
  "يبيع",
  "يسافر",
  "يتعلّم",
  "يساعد",
  "ينتظر",
  "يستمع",
  "يكون",
  "يملك",
  "يستطيع",
];

function VerbTrainer({ lang, voiceGender }: { lang: string; voiceGender: VoiceGender }) {
  const run = useServerFn(translateText);
  const [verb, setVerb] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ translation: string; conjugations: Conjugation[] } | null>(
    null,
  );
  const langName = langByCode(lang)?.name ?? "English";
  const bcp47 = langByCode(lang)?.bcp47 ?? "en-US";

  const train = async (v: string) => {
    const t = v.trim();
    if (!t || loading) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const r = await run({ data: { text: t, targetLang: langName } });
      setResult({ translation: r.translation, conjugations: r.conjugations });
      if (r.conjugations.length === 0)
        setError("لم يتم التعرف على فعل. جرّب فعلاً واضحاً مثل: يكتب، يأكل.");
    } catch (e: any) {
      setError(
        e?.message?.includes("CREDITS")
          ? "نفد الرصيد."
          : e?.message?.includes("RATE_LIMIT")
            ? "تجاوزت حد الطلبات، حاول لاحقاً."
            : "حدث خطأ، حاول مجدداً.",
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border bg-card p-4">
        <div className="flex items-center gap-2">
          <Zap className="size-5 text-primary" />
          <p className="font-bold">تصريف الأفعال بـ{langByCode(lang)?.nameAr ?? langName}</p>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          اكتب فعلاً بأي لغة وسيعرض تصريفه الكامل مع أمثلة.
        </p>
        <form
          className="mt-3 flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            train(verb);
          }}
        >
          <input
            value={verb}
            onChange={(e) => setVerb(e.target.value)}
            placeholder="مثال: يكتب / to write"
            dir="auto"
            className="flex-1 rounded-xl border bg-background px-3 py-2 outline-none focus:ring-2 focus:ring-primary"
          />
          <Button
            type="submit"
            disabled={loading || !verb.trim()}
            className="rounded-xl gradient-primary text-primary-foreground"
          >
            {loading ? <Loader2 className="size-4 animate-spin" /> : "درّب"}
          </Button>
        </form>
        <div className="mt-3 flex flex-wrap gap-1.5">
          {COMMON_VERBS.map((v) => (
            <button
              key={v}
              onClick={() => {
                setVerb(v);
                train(v);
              }}
              className="rounded-lg border bg-background px-2.5 py-1 text-xs text-muted-foreground hover:border-primary"
            >
              {v}
            </button>
          ))}
        </div>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      {result && result.conjugations.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between rounded-2xl border bg-card p-4">
            <div>
              <div className="text-xs text-muted-foreground">الفعل</div>
              <div className="text-lg font-bold" dir="auto">
                {result.translation}
              </div>
            </div>
            <Button
              variant="secondary"
              size="sm"
              className="rounded-xl gap-1.5"
              onClick={() => speak(result.translation, bcp47, voiceGender)}
            >
              <Volume2 className="size-4" /> استمع
            </Button>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            {result.conjugations.map((c, i) => (
              <div key={i} className="rounded-xl border bg-card p-3">
                <div className="flex items-center justify-between">
                  <div dir="auto">
                    <span className="text-muted-foreground">{c.pronoun}</span>{" "}
                    <span className="font-bold">{c.form}</span>
                  </div>
                  <button
                    onClick={() => speak(c.example || c.form, bcp47, voiceGender)}
                    className="text-muted-foreground hover:text-primary"
                  >
                    <Volume2 className="size-4" />
                  </button>
                </div>
                {c.example && (
                  <div className="mt-1 text-sm text-muted-foreground" dir="auto">
                    {c.example}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
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
  items,
  mine,
  lang,
  cache,
  voiceGender,
  ready,
}: {
  items: LearnItem[];
  mine: LearnItem[];
  lang: string;
  cache: Record<string, string>;
  voiceGender: VoiceGender;
  ready: boolean;
}) {
  const [scope, setScope] = usePersistedState<string>("quiz_scope", "all");
  const [queue, setQueue] = useState<QuizQ[]>([]);
  const [idx, setIdx] = useState(0);
  const [score, setScore] = useState(0);
  const [total, setTotal] = useState(0);
  const [mistakes, setMistakes] = useState(0);
  const [picked, setPicked] = useState<string | null>(null);
  const [started, setStarted] = useState(false);
  const bcp47 = langByCode(lang)?.bcp47 ?? "en-US";

  // نطاق الاختبار: كل الكلمات أو فئة واحدة (مثل أجزاء الجسم)
  const scopedItems: LearnItem[] =
    scope === "all"
      ? items
      : scope === "pronouns"
        ? PRONOUNS
        : scope === "mine"
          ? mine
          : (WORD_CATEGORIES.find((c) => c.id === scope)?.items ?? items);

  const start = () => {
    const qs = buildQuestions(scopedItems, lang, cache);
    setQueue(qs);
    setIdx(0);
    setScore(0);
    setTotal(0);
    setMistakes(0);
    setPicked(null);
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
        copy.splice(insertAt, 0, {
          ...current,
          options: [...current.options].sort(() => Math.random() - 0.5),
        });
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
        <p className="text-muted-foreground">
          اختبر معرفتك! اختر الترجمة الصحيحة للكلمة. الأخطاء تتكرر تلقائياً حتى تتقنها.
        </p>
        <Button
          onClick={start}
          disabled={!ready}
          className="rounded-xl gradient-primary text-primary-foreground"
        >
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
        <p className="text-muted-foreground">
          أجبت {score} من {total} ({mistakes} خطأ مُكرّر)
        </p>
        <Button onClick={start} className="rounded-xl gap-1.5">
          <RotateCcw className="size-4" /> أعد الاختبار
        </Button>
      </div>
    );
  }

  const answered = picked !== null;
  const isRight = answered && picked === current.correct;
  const progress = Math.round((idx / queue.length) * 100);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between text-sm font-medium">
        <span>
          سؤال {idx + 1} / {queue.length}
        </span>
        <span className="text-primary">النتيجة: {score}</span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full gradient-primary transition-all duration-300"
          style={{ width: `${progress}%` }}
        />
      </div>

      {/* بطاقة السؤال — الصورة تتغير مع كل كلمة */}
      <div
        className={`rounded-3xl border p-6 text-center transition-colors ${answered ? (isRight ? "border-primary bg-primary/5" : "border-destructive bg-destructive/5") : "bg-card"}`}
      >
        <div
          key={current.item.emoji + idx}
          className="mx-auto mb-2 flex size-24 items-center justify-center rounded-full bg-muted text-6xl animate-in zoom-in-50 duration-300"
        >
          {current.item.emoji}
        </div>
        <div className="text-2xl font-bold">{current.item.ar}</div>
        <div className="text-xs text-muted-foreground">
          {answered ? "" : "اختر الترجمة الصحيحة"}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {current.options.map((opt) => {
          const isCorrect = opt === current.correct;
          const state =
            answered && isCorrect ? "correct" : answered && opt === picked ? "wrong" : "idle";
          return (
            <button
              key={opt}
              onClick={() => choose(opt)}
              disabled={answered}
              dir="auto"
              className={`flex items-center justify-between rounded-xl border px-4 py-3 text-start font-medium transition-colors ${
                state === "correct"
                  ? "border-primary bg-primary/10"
                  : state === "wrong"
                    ? "border-destructive bg-destructive/10"
                    : "bg-card hover:bg-muted"
              }`}
            >
              {opt}
              {state === "correct" && <Check className="size-4 text-primary" />}
              {state === "wrong" && <X className="size-4 text-destructive" />}
            </button>
          );
        })}
      </div>

      {/* لوحة الشرح بعد الإجابة */}
      {answered && (
        <div className="space-y-3 rounded-2xl border bg-card p-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
          <div
            className={`flex items-center gap-2 font-bold ${isRight ? "text-primary" : "text-destructive"}`}
          >
            {isRight ? (
              <>
                <Check className="size-5" /> أحسنت! إجابة صحيحة
              </>
            ) : (
              <>
                <X className="size-5" /> ليست صحيحة، تعلّمها الآن
              </>
            )}
          </div>
          <div className="flex items-center justify-between rounded-xl bg-muted/60 p-3">
            <div dir="auto">
              <div className="text-sm text-muted-foreground">
                {current.item.ar} {current.item.emoji}
              </div>
              <div className="text-lg font-bold">{current.correct}</div>
            </div>
            <Button
              variant="secondary"
              size="sm"
              className="rounded-xl gap-1.5"
              onClick={() => speak(current.correct, bcp47, voiceGender)}
            >
              <Volume2 className="size-4" /> استمع
            </Button>
          </div>
          <p className="text-sm text-muted-foreground">
            «{current.item.ar}» تعني{" "}
            <span className="font-medium text-foreground" dir="auto">
              {current.correct}
            </span>{" "}
            بـ{langByCode(lang)?.nameAr ?? lang}.{!isRight && " ستظهر هذه الكلمة مجدداً لتثبيتها."}
          </p>
        </div>
      )}

      {answered && (
        <Button
          onClick={next}
          className="w-full rounded-xl gradient-primary text-primary-foreground"
        >
          التالي
        </Button>
      )}
    </div>
  );
}
