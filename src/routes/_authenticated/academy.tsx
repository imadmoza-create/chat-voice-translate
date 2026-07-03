import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { langByCode } from "@/lib/languages";
import { LEVELS, levelByCode, nextLevel, type CEFRLevel, type Theme } from "@/lib/curriculum";
import { speak, type VoiceGender } from "@/lib/speech";
import { useUserGender, useAppLang } from "@/lib/prefs";
import {
  generateLesson, generateVerbPack, generateExercise, generateLevelTest,
  placementTest, generateDailyPlan, generateDialogue, getProgress, updateProgress,
  addReviews, getDueReviews, gradeReview,
} from "@/lib/academy.functions";
import { Button } from "@/components/ui/button";
import {
  GraduationCap, Loader2, Volume2, Trophy, Flame, Star, ChevronRight, ChevronLeft,
  BookOpen, Zap, Headphones, PenLine, Mic, Brain, CalendarCheck, ClipboardCheck,
  MessageSquare, Check, X, ArrowRight, Target,
} from "lucide-react";

export const Route = createFileRoute("/_authenticated/academy")({
  head: () => ({ meta: [{ title: "الأكاديمية — الطريق إلى B2 — ترجملي" }] }),
  component: AcademyPage,
});

type Progress = { level: string; xp: number; streak: number; last_active_date: string | null; completed_themes: string[] };

function aiError(e: any) {
  const m = String(e?.message ?? "");
  if (m.includes("RATE_LIMIT")) toast.error("تجاوزت حد الطلبات، حاول بعد قليل.");
  else if (m.includes("CREDITS")) toast.error("نفد رصيد الذكاء الاصطناعي.");
  else toast.error("حدث خطأ، حاول مجدداً.");
}

function AcademyPage() {
  const [lang] = useAppLang();
  const [userGender] = useUserGender();
  const voiceGender: VoiceGender = userGender === "male" ? "female" : "male";
  const langName = langByCode(lang)?.name ?? "English";
  const langNameAr = langByCode(lang)?.nameAr ?? lang;
  const bcp47 = langByCode(lang)?.bcp47 ?? "en-US";

  const [progress, setProgress] = useState<Progress | null>(null);
  const [view, setView] = useState<"home" | "level" | "theme" | "placement" | "test" | "verbs" | "review" | "plan" | "dialogue">("home");
  const [activeLevel, setActiveLevel] = useState<CEFRLevel>("A1");
  const [activeTheme, setActiveTheme] = useState<Theme | null>(null);

  const runProgress = useServerFn(getProgress);
  const runUpdate = useServerFn(updateProgress);

  const refresh = async () => {
    try { setProgress(await runProgress({ data: { targetLang: lang } }) as Progress); } catch (e) { aiError(e); }
  };
  useEffect(() => { refresh(); /* eslint-disable-next-line */ }, [lang]);

  const award = async (xp: number, theme?: string) => {
    try {
      const p = await runUpdate({ data: { targetLang: lang, addXp: xp, completeTheme: theme } }) as Progress;
      setProgress(p);
      toast.success(`+${xp} نقطة! 🎉`);
    } catch (e) { aiError(e); }
  };

  const promote = async (level: CEFRLevel) => {
    try { setProgress(await runUpdate({ data: { targetLang: lang, level } }) as Progress); } catch (e) { aiError(e); }
  };

  const shared = { lang, langName, bcp47, voiceGender, level: activeLevel, award };

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-2">
        <GraduationCap className="size-6 text-primary" />
        <h1 className="text-2xl font-bold">الأكاديمية — الطريق إلى B2</h1>
      </div>

      {/* لغة التعلّم — تُغيَّر من الإعدادات فقط */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-card px-3 py-2 text-sm">
        <div className="flex items-center gap-2">
          <span className="text-muted-foreground">لغة التعلّم:</span>
          <span className="rounded-full bg-primary/10 px-2.5 py-0.5 font-semibold text-primary">{langNameAr}</span>
        </div>
        <Link to="/settings" className="text-xs text-muted-foreground underline hover:text-primary">
          تغيير اللغة من الإعدادات
        </Link>
      </div>


      {/* شريط التقدّم */}
      {progress && (
        <div className="grid grid-cols-3 gap-2">
          <Stat icon={<Target className="size-4" />} label="المستوى" value={progress.level} />
          <Stat icon={<Star className="size-4" />} label="النقاط" value={String(progress.xp)} />
          <Stat icon={<Flame className="size-4" />} label="التتابع" value={`${progress.streak} يوم`} />
        </div>
      )}

      {view !== "home" && (
        <Button variant="ghost" size="sm" className="rounded-xl gap-1" onClick={() => setView(activeTheme && view === "theme" ? "level" : "home")}>
          <ChevronRight className="size-4" /> رجوع
        </Button>
      )}

      {view === "home" && (
        <Home
          progress={progress}
          onLevel={(l) => { setActiveLevel(l); setView("level"); }}
          onPlacement={() => setView("placement")}
          onPlan={() => setView("plan")}
          onReview={() => setView("review")}
          onVerbs={(l) => { setActiveLevel(l); setView("verbs"); }}
          onDialogue={(l) => { setActiveLevel(l); setView("dialogue"); }}
        />
      )}

      {view === "level" && (
        <LevelView
          level={activeLevel}
          completed={progress?.completed_themes ?? []}
          onTheme={(t) => { setActiveTheme(t); setView("theme"); }}
          onTest={() => setView("test")}
          onVerbs={() => setView("verbs")}
          onDialogue={() => setView("dialogue")}
        />
      )}

      {view === "theme" && activeTheme && <ThemeView theme={activeTheme} {...shared} />}
      {view === "verbs" && <VerbsView {...shared} />}
      {view === "test" && <LevelTestView {...shared} onPromote={promote} />}
      {view === "placement" && <PlacementView lang={lang} langName={langName} bcp47={bcp47} voiceGender={voiceGender} onSet={(l) => { promote(l); setView("home"); }} />}
      {view === "review" && <ReviewView lang={lang} bcp47={bcp47} voiceGender={voiceGender} award={award} />}
      {view === "plan" && <PlanView {...shared} />}
      {view === "dialogue" && <DialogueView {...shared} />}
    </div>
  );
}

function Stat({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex flex-col items-center gap-0.5 rounded-2xl border bg-card p-3 text-center">
      <div className="text-primary">{icon}</div>
      <div className="text-lg font-extrabold">{value}</div>
      <div className="text-xs text-muted-foreground">{label}</div>
    </div>
  );
}

function ActionCard({ icon, title, desc, onClick }: { icon: React.ReactNode; title: string; desc: string; onClick: () => void }) {
  return (
    <button onClick={onClick} className="flex items-start gap-3 rounded-2xl border bg-card p-4 text-start transition-transform hover:-translate-y-0.5 hover:border-primary">
      <div className="rounded-xl bg-primary/10 p-2 text-primary">{icon}</div>
      <div className="flex-1">
        <div className="font-bold">{title}</div>
        <div className="text-xs text-muted-foreground">{desc}</div>
      </div>
      <ChevronLeft className="size-4 text-muted-foreground" />
    </button>
  );
}

// ===================== الرئيسية =====================
function Home({ progress, onLevel, onPlacement, onPlan, onReview, onVerbs, onDialogue }: {
  progress: Progress | null;
  onLevel: (l: CEFRLevel) => void;
  onPlacement: () => void; onPlan: () => void; onReview: () => void;
  onVerbs: (l: CEFRLevel) => void; onDialogue: (l: CEFRLevel) => void;
}) {
  const curLevel = (progress?.level ?? "A1") as CEFRLevel;
  return (
    <div className="space-y-5">
      <div className="grid gap-2 sm:grid-cols-2">
        <ActionCard icon={<ClipboardCheck className="size-5" />} title="حدّد مستواك" desc="اختبار سريع يضعك في المستوى المناسب." onClick={onPlacement} />
        <ActionCard icon={<CalendarCheck className="size-5" />} title="خطتك اليومية" desc="مهام اليوم للوصول إلى B2." onClick={onPlan} />
        <ActionCard icon={<Brain className="size-5" />} title="المراجعة الذكية" desc="راجع الكلمات قبل أن تنساها (تكرار متباعد)." onClick={onReview} />
        <ActionCard icon={<Zap className="size-5" />} title="تدريب الأفعال" desc="تصريف الأفعال في كل الأزمنة." onClick={() => onVerbs(curLevel)} />
        <ActionCard icon={<MessageSquare className="size-5" />} title="محادثات يومية وعمل" desc="حوارات جاهزة مع الترجمة والصوت." onClick={() => onDialogue(curLevel)} />
      </div>

      <div>
        <h2 className="mb-2 text-lg font-bold">المستويات</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          {LEVELS.map((lv) => {
            const done = (progress?.completed_themes ?? []).filter((t) => lv.themes.some((th) => th.id === t)).length;
            const isCurrent = lv.level === curLevel;
            return (
              <button key={lv.level} onClick={() => onLevel(lv.level)} className={`rounded-2xl border bg-gradient-to-br ${lv.color} p-4 text-start text-white shadow-card transition-transform hover:-translate-y-0.5`}>
                <div className="flex items-center justify-between">
                  <span className="text-xl font-extrabold">{lv.title}</span>
                  {isCurrent && <span className="rounded-full bg-white/25 px-2 py-0.5 text-xs">أنت هنا</span>}
                </div>
                <p className="mt-1 text-sm text-white/90">{lv.desc}</p>
                <p className="mt-2 text-xs text-white/80">{lv.wordTarget} • {done}/{lv.themes.length} مواضيع</p>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ===================== عرض المستوى =====================
function LevelView({ level, completed, onTheme, onTest, onVerbs, onDialogue }: {
  level: CEFRLevel; completed: string[];
  onTheme: (t: Theme) => void; onTest: () => void; onVerbs: () => void; onDialogue: () => void;
}) {
  const lv = levelByCode(level)!;
  return (
    <div className="space-y-4">
      <div className={`rounded-2xl bg-gradient-to-br ${lv.color} p-4 text-white`}>
        <div className="text-xl font-extrabold">{lv.title}</div>
        <p className="text-sm text-white/90">{lv.desc}</p>
        <p className="mt-1 text-xs text-white/80">{lv.wordTarget}</p>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button onClick={onTest} className="rounded-xl gradient-primary text-primary-foreground gap-1.5"><ClipboardCheck className="size-4" /> اختبار المستوى</Button>
        <Button onClick={onVerbs} variant="secondary" className="rounded-xl gap-1.5"><Zap className="size-4" /> الأفعال</Button>
        <Button onClick={onDialogue} variant="secondary" className="rounded-xl gap-1.5"><MessageSquare className="size-4" /> محادثات</Button>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {lv.themes.map((t) => {
          const done = completed.includes(t.id);
          return (
            <button key={t.id} onClick={() => onTheme(t)} className="relative flex flex-col items-center gap-1 rounded-2xl border bg-card p-4 text-center transition-transform hover:-translate-y-1 hover:border-primary">
              {done && <Check className="absolute end-2 top-2 size-4 text-primary" />}
              <div className="text-3xl">{t.emoji}</div>
              <div className="text-sm font-bold">{t.title}</div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

type Shared = { lang: string; langName: string; bcp47: string; voiceGender: VoiceGender; level: CEFRLevel; award: (xp: number, theme?: string) => void };

// ===================== درس موضوع =====================
function ThemeView({ theme, lang, langName, bcp47, voiceGender, level, award }: Shared & { theme: Theme }) {
  const runLesson = useServerFn(generateLesson);
  const runAddReviews = useServerFn(addReviews);
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<any>(null);
  const [tab, setTab] = useState<"vocab" | "grammar" | "connectors" | "phrases" | "ex">("vocab");

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const r = await runLesson({ data: { level, theme: theme.title, targetLang: langName } });
        setData(r);
        if (Array.isArray(r.vocab) && r.vocab.length) {
          runAddReviews({ data: { lang, level, words: r.vocab.slice(0, 20).map((v: any) => ({ word: String(v.word), translation: String(v.translation) })) } }).catch(() => {});
        }
      } catch (e) { aiError(e); } finally { setLoading(false); }
    })();
    /* eslint-disable-next-line */
  }, [theme.id, level, lang]);

  if (loading) return <Center />;
  if (!data) return <p className="text-sm text-destructive">تعذّر تحميل الدرس.</p>;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2"><span className="text-3xl">{theme.emoji}</span><h2 className="text-xl font-bold">{theme.title}</h2></div>
      <div className="grid grid-cols-5 gap-1 rounded-xl bg-muted p-1 text-xs font-medium">
        {([["vocab", "مفردات"], ["grammar", "قواعد"], ["connectors", "روابط"], ["phrases", "عبارات"], ["ex", "تمارين"]] as const).map(([k, t]) => (
          <button key={k} onClick={() => setTab(k)} className={`rounded-lg py-1.5 ${tab === k ? "bg-card shadow-sm" : "text-muted-foreground"}`}>{t}</button>
        ))}
      </div>

      {tab === "vocab" && (
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {data.vocab.map((v: any, i: number) => (
            <div key={i} className="rounded-xl border bg-card p-3">
              <div className="flex items-center justify-between">
                <div dir="auto"><span className="font-bold">{v.word}</span> <span className="text-muted-foreground">— {v.translation}</span></div>
                <button onClick={() => speak(v.word, bcp47, voiceGender)} className="text-muted-foreground hover:text-primary"><Volume2 className="size-4" /></button>
              </div>
              {v.example && <div className="mt-1 text-sm" dir="auto">{v.example}</div>}
              {v.exampleTranslation && <div className="text-xs text-muted-foreground">{v.exampleTranslation}</div>}
            </div>
          ))}
        </div>
      )}

      {tab === "grammar" && (
        <div className="space-y-2 rounded-2xl border bg-card p-4">
          <div className="font-bold">{data.grammar.title}</div>
          <p className="text-sm text-muted-foreground">{data.grammar.explanation}</p>
          <ul className="list-disc space-y-1 ps-5 text-sm" dir="auto">
            {(data.grammar.points ?? []).map((p: string, i: number) => <li key={i}>{p}</li>)}
          </ul>
        </div>
      )}

      {tab === "connectors" && (
        <div className="grid gap-2 sm:grid-cols-2">
          {data.connectors.map((c: any, i: number) => (
            <div key={i} className="rounded-xl border bg-card p-3">
              <div className="flex items-center justify-between"><span className="font-bold" dir="auto">{c.word}</span><button onClick={() => speak(c.example || c.word, bcp47, voiceGender)} className="text-muted-foreground hover:text-primary"><Volume2 className="size-4" /></button></div>
              <div className="text-xs text-muted-foreground">{c.meaning}</div>
              {c.example && <div className="mt-1 text-sm" dir="auto">{c.example}</div>}
            </div>
          ))}
        </div>
      )}

      {tab === "phrases" && (
        <div className="space-y-2">
          {data.phrases.map((p: any, i: number) => (
            <div key={i} className="flex items-center justify-between rounded-xl border bg-card p-3">
              <div><div className="font-medium" dir="auto">{p.text}</div><div className="text-xs text-muted-foreground">{p.translation}</div></div>
              <button onClick={() => speak(p.text, bcp47, voiceGender)} className="text-muted-foreground hover:text-primary"><Volume2 className="size-4" /></button>
            </div>
          ))}
        </div>
      )}

      {tab === "ex" && <ExerciseHub theme={theme} lang={lang} langName={langName} bcp47={bcp47} voiceGender={voiceGender} level={level} award={award} />}

      <Button onClick={() => award(20, theme.id)} className="w-full rounded-xl gradient-primary text-primary-foreground gap-1.5">
        <Check className="size-4" /> أنهيت هذا الدرس (+20)
      </Button>
    </div>
  );
}

// ===================== مركز التمارين =====================
function ExerciseHub({ theme, langName, bcp47, voiceGender, level, award }: Shared & { theme: Theme }) {
  const run = useServerFn(generateExercise);
  const [type, setType] = useState<"listening" | "writing" | "speaking" | "grammar" | null>(null);
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState<any[]>([]);

  const load = async (t: typeof type) => {
    if (!t) return;
    setType(t); setLoading(true); setItems([]);
    try { const r = await run({ data: { level, theme: theme.title, targetLang: langName, type: t } }); setItems(r.items ?? []); }
    catch (e) { aiError(e); } finally { setLoading(false); }
  };

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {([["listening", "استماع", <Headphones key="h" className="size-4" />], ["grammar", "قواعد", <BookOpen key="b" className="size-4" />], ["writing", "كتابة", <PenLine key="p" className="size-4" />], ["speaking", "تحدّث", <Mic key="m" className="size-4" />]] as const).map(([k, t, ic]) => (
          <Button key={k} variant={type === k ? "default" : "secondary"} className="rounded-xl gap-1.5" onClick={() => load(k)}>{ic} {t}</Button>
        ))}
      </div>
      {loading && <Center />}
      {!loading && type && items.length > 0 && (
        type === "listening" ? <ListeningEx items={items} bcp47={bcp47} voiceGender={voiceGender} award={award} />
        : type === "grammar" ? <McqEx items={items.map((i) => ({ prompt: i.prompt, options: i.options, correct: i.correct, explanation: i.explanation }))} award={award} />
        : <ProductionEx items={items} bcp47={bcp47} voiceGender={voiceGender} />
      )}
    </div>
  );
}

function ListeningEx({ items, bcp47, voiceGender, award }: { items: any[]; bcp47: string; voiceGender: VoiceGender; award: (n: number) => void }) {
  return (
    <div className="space-y-3">
      {items.map((it, i) => (
        <ListeningItem key={i} it={it} bcp47={bcp47} voiceGender={voiceGender} award={award} />
      ))}
    </div>
  );
}
function ListeningItem({ it, bcp47, voiceGender, award }: { it: any; bcp47: string; voiceGender: VoiceGender; award: (n: number) => void }) {
  const [picked, setPicked] = useState<string | null>(null);
  return (
    <div className="rounded-xl border bg-card p-3 space-y-2">
      <Button variant="secondary" size="sm" className="rounded-xl gap-1.5" onClick={() => speak(it.audioText, bcp47, voiceGender)}><Volume2 className="size-4" /> استمع</Button>
      <div className="text-sm font-medium">{it.prompt}</div>
      <div className="grid gap-1.5">
        {(it.options ?? []).map((o: string) => {
          const state = picked ? (o === it.correct ? "ok" : o === picked ? "no" : "") : "";
          return <button key={o} dir="auto" onClick={() => { if (!picked) { setPicked(o); if (o === it.correct) award(5); } }} className={`rounded-lg border px-3 py-2 text-start text-sm ${state === "ok" ? "border-primary bg-primary/10" : state === "no" ? "border-destructive bg-destructive/10" : "hover:bg-muted"}`}>{o}</button>;
        })}
      </div>
    </div>
  );
}

function McqEx({ items, award }: { items: any[]; award: (n: number) => void }) {
  return (
    <div className="space-y-3">
      {items.map((it, i) => <McqItem key={i} it={it} award={award} />)}
    </div>
  );
}
function McqItem({ it, award }: { it: any; award: (n: number) => void }) {
  const [picked, setPicked] = useState<string | null>(null);
  return (
    <div className="rounded-xl border bg-card p-3 space-y-2">
      <div className="text-sm font-medium" dir="auto">{it.prompt}</div>
      <div className="grid gap-1.5">
        {(it.options ?? []).map((o: string) => {
          const state = picked ? (o === it.correct ? "ok" : o === picked ? "no" : "") : "";
          return <button key={o} dir="auto" onClick={() => { if (!picked) { setPicked(o); if (o === it.correct) award(5); } }} className={`flex items-center justify-between rounded-lg border px-3 py-2 text-start text-sm ${state === "ok" ? "border-primary bg-primary/10" : state === "no" ? "border-destructive bg-destructive/10" : "hover:bg-muted"}`}>{o}{state === "ok" && <Check className="size-4 text-primary" />}{state === "no" && <X className="size-4 text-destructive" />}</button>;
        })}
      </div>
      {picked && it.explanation && <p className="text-xs text-muted-foreground">{it.explanation}</p>}
    </div>
  );
}

function ProductionEx({ items, bcp47, voiceGender }: { items: any[]; bcp47: string; voiceGender: VoiceGender }) {
  return (
    <div className="space-y-3">
      {items.map((it, i) => <ProductionItem key={i} it={it} bcp47={bcp47} voiceGender={voiceGender} />)}
    </div>
  );
}
function ProductionItem({ it, bcp47, voiceGender }: { it: any; bcp47: string; voiceGender: VoiceGender }) {
  const [show, setShow] = useState(false);
  return (
    <div className="rounded-xl border bg-card p-3 space-y-2">
      <div className="text-sm font-medium">{it.task}</div>
      <textarea className="min-h-16 w-full rounded-xl border bg-background p-2 text-sm" placeholder="اكتب إجابتك هنا..." dir="auto" />
      <div className="flex gap-2">
        <Button variant="secondary" size="sm" className="rounded-xl" onClick={() => setShow((s) => !s)}>{show ? "إخفاء النموذج" : "أظهر النموذج"}</Button>
        {show && <Button variant="ghost" size="sm" className="rounded-xl gap-1.5" onClick={() => speak(it.sample, bcp47, voiceGender)}><Volume2 className="size-4" /> استمع</Button>}
      </div>
      {show && <div className="rounded-lg bg-muted p-2 text-sm" dir="auto">{it.sample}<div className="text-xs text-muted-foreground">{it.sampleTranslation}</div></div>}
    </div>
  );
}

// ===================== الأفعال =====================
const VERB_CATEGORIES = [
  "الأفعال الأساسية الأكثر استخداماً",
  "أفعال الحياة اليومية",
  "أفعال العمل والمهن",
  "أفعال الحركة والتنقّل",
  "أفعال التواصل والكلام",
  "أفعال المشاعر والأحاسيس",
  "أفعال التفكير والرأي",
  "الأفعال المنعكسة",
  "الأفعال المركّبة",
  "الأفعال الشاذة",
  "أفعال الطبخ والطعام",
  "أفعال التسوّق والمال",
  "أفعال السفر والمطار",
  "أفعال الدراسة والتعلّم",
  "الأفعال المساعدة والنمطية",
];
function VerbsView({ langName, bcp47, voiceGender, level }: Shared) {
  const run = useServerFn(generateVerbPack);
  const [cat, setCat] = useState(VERB_CATEGORIES[0]);
  const [loading, setLoading] = useState(false);
  const [verbs, setVerbs] = useState<any[]>([]);

  const load = async (c: string) => {
    setCat(c); setLoading(true); setVerbs([]);
    try { const r = await run({ data: { level, category: c, targetLang: langName } }); setVerbs(r.verbs ?? []); }
    catch (e) { aiError(e); } finally { setLoading(false); }
  };
  useEffect(() => { load(VERB_CATEGORIES[0]); /* eslint-disable-next-line */ }, [langName, level]);

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-bold">تدريب الأفعال</h2>
      <div className="flex flex-wrap gap-1.5">
        {VERB_CATEGORIES.map((c) => (
          <button key={c} onClick={() => load(c)} className={`rounded-xl border px-3 py-1.5 text-xs ${cat === c ? "gradient-primary text-primary-foreground" : "bg-card text-muted-foreground"}`}>{c}</button>
        ))}
      </div>
      {loading && <Center />}
      {!loading && verbs.map((v, i) => (
        <div key={i} className="space-y-2 rounded-2xl border bg-card p-4">
          <div className="flex items-center justify-between">
            <div dir="auto"><span className="text-lg font-bold">{v.infinitive}</span> <span className="text-muted-foreground">— {v.translation}</span></div>
            <span className="rounded-full bg-secondary px-2 py-0.5 text-xs">{v.type}</span>
          </div>
          {(v.tenses ?? []).map((t: any, j: number) => (
            <div key={j} className="rounded-xl bg-muted/40 p-2">
              <div className="mb-1 text-sm font-semibold">{t.tense}</div>
              <div className="grid grid-cols-2 gap-1 text-sm" dir="auto">
                {(t.forms ?? []).map((f: any, k: number) => <div key={k}><span className="text-muted-foreground">{f.pronoun}</span> {f.form}</div>)}
              </div>
              {t.example && <div className="mt-1 flex items-center justify-between text-xs text-muted-foreground"><span dir="auto">{t.example}</span><button onClick={() => speak(String(t.example).split("—")[0], bcp47, voiceGender)}><Volume2 className="size-4" /></button></div>}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

// ===================== اختبار المستوى =====================
function LevelTestView({ lang, langName, level, award, onPromote }: Shared & { onPromote: (l: CEFRLevel) => void }) {
  const run = useServerFn(generateLevelTest);
  const [loading, setLoading] = useState(true);
  const [qs, setQs] = useState<any[]>([]);
  const [idx, setIdx] = useState(0);
  const [picked, setPicked] = useState<string | null>(null);
  const [score, setScore] = useState(0);
  const [done, setDone] = useState(false);

  useEffect(() => {
    (async () => { setLoading(true); try { const r = await run({ data: { level, targetLang: langName } }); setQs(r.questions ?? []); } catch (e) { aiError(e); } finally { setLoading(false); } })();
    /* eslint-disable-next-line */
  }, [level, lang]);

  if (loading) return <Center />;
  if (!qs.length) return <p className="text-sm text-destructive">تعذّر تحميل الاختبار.</p>;

  if (done) {
    const pct = Math.round((score / qs.length) * 100);
    const passed = pct >= 80;
    const nx = nextLevel(level);
    return (
      <div className="rounded-2xl border bg-card p-8 text-center space-y-4">
        <Trophy className="mx-auto size-12 text-primary" />
        <div className="text-3xl font-extrabold text-gradient">{pct}%</div>
        <p className="text-muted-foreground">أجبت {score} من {qs.length}</p>
        {passed ? (
          nx ? <>
            <p className="font-semibold text-primary">أحسنت! اجتزت مستوى {level} 🎉</p>
            <Button onClick={() => { award(50); onPromote(nx); }} className="rounded-xl gradient-primary text-primary-foreground gap-1.5"><ArrowRight className="size-4" /> انتقل إلى {nx}</Button>
          </> : <p className="font-semibold text-primary">ممتاز! وصلت إلى B2 🏆</p>
        ) : <p className="text-muted-foreground">تحتاج 80% للاجتياز. راجع الدروس وحاول مجدداً.</p>}
      </div>
    );
  }

  const q = qs[idx];
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between text-sm font-medium"><span>سؤال {idx + 1} / {qs.length}</span><span className="text-primary">{q.skill}</span></div>
      <div className="rounded-2xl border bg-card p-5"><div className="font-semibold" dir="auto">{q.prompt}</div></div>
      <div className="grid gap-2">
        {(q.options ?? []).map((o: string) => {
          const state = picked ? (o === q.correct ? "ok" : o === picked ? "no" : "") : "";
          return <button key={o} dir="auto" disabled={!!picked} onClick={() => { setPicked(o); if (o === q.correct) setScore((s) => s + 1); }} className={`flex items-center justify-between rounded-xl border px-4 py-3 text-start ${state === "ok" ? "border-primary bg-primary/10" : state === "no" ? "border-destructive bg-destructive/10" : "hover:bg-muted"}`}>{o}{state === "ok" && <Check className="size-4 text-primary" />}{state === "no" && <X className="size-4 text-destructive" />}</button>;
        })}
      </div>
      {picked && <Button onClick={() => { if (idx + 1 >= qs.length) setDone(true); else { setIdx((i) => i + 1); setPicked(null); } }} className="w-full rounded-xl gradient-primary text-primary-foreground">{idx + 1 >= qs.length ? "إنهاء" : "التالي"}</Button>}
    </div>
  );
}

// ===================== تحديد المستوى =====================
function PlacementView({ langName, onSet }: { lang: string; langName: string; bcp47: string; voiceGender: VoiceGender; onSet: (l: CEFRLevel) => void }) {
  const run = useServerFn(placementTest);
  const [loading, setLoading] = useState(true);
  const [qs, setQs] = useState<any[]>([]);
  const [idx, setIdx] = useState(0);
  const [picked, setPicked] = useState<string | null>(null);
  const [byLevel, setByLevel] = useState<Record<string, number>>({});
  const [done, setDone] = useState(false);

  useEffect(() => {
    (async () => { setLoading(true); try { const r = await run({ data: { targetLang: langName } }); setQs(r.questions ?? []); } catch (e) { aiError(e); } finally { setLoading(false); } })();
    /* eslint-disable-next-line */
  }, []);

  if (loading) return <Center />;
  if (!qs.length) return <p className="text-sm text-destructive">تعذّر تحميل الاختبار.</p>;

  const recommend = (): CEFRLevel => {
    const order: CEFRLevel[] = ["A1", "A2", "B1", "B2"];
    let rec: CEFRLevel = "A1";
    for (const lv of order) {
      const total = qs.filter((q) => q.level === lv).length || 1;
      if ((byLevel[lv] ?? 0) / total >= 0.6) rec = lv;
    }
    return rec;
  };

  if (done) {
    const rec = recommend();
    return (
      <div className="rounded-2xl border bg-card p-8 text-center space-y-4">
        <Target className="mx-auto size-12 text-primary" />
        <p className="text-muted-foreground">مستواك المقترح</p>
        <div className="text-4xl font-extrabold text-gradient">{rec}</div>
        <Button onClick={() => onSet(rec)} className="rounded-xl gradient-primary text-primary-foreground gap-1.5"><Check className="size-4" /> ابدأ من هنا</Button>
      </div>
    );
  }

  const q = qs[idx];
  return (
    <div className="space-y-4">
      <div className="text-sm font-medium">سؤال {idx + 1} / {qs.length}</div>
      <div className="rounded-2xl border bg-card p-5"><div className="font-semibold" dir="auto">{q.prompt}</div></div>
      <div className="grid gap-2">
        {(q.options ?? []).map((o: string) => {
          const state = picked ? (o === q.correct ? "ok" : o === picked ? "no" : "") : "";
          return <button key={o} dir="auto" disabled={!!picked} onClick={() => { setPicked(o); if (o === q.correct) setByLevel((b) => ({ ...b, [q.level]: (b[q.level] ?? 0) + 1 })); }} className={`rounded-xl border px-4 py-3 text-start ${state === "ok" ? "border-primary bg-primary/10" : state === "no" ? "border-destructive bg-destructive/10" : "hover:bg-muted"}`}>{o}</button>;
        })}
      </div>
      {picked && <Button onClick={() => { if (idx + 1 >= qs.length) setDone(true); else { setIdx((i) => i + 1); setPicked(null); } }} className="w-full rounded-xl gradient-primary text-primary-foreground">{idx + 1 >= qs.length ? "أظهر النتيجة" : "التالي"}</Button>}
    </div>
  );
}

// ===================== المراجعة الذكية =====================
function ReviewView({ lang, bcp47, voiceGender, award }: { lang: string; bcp47: string; voiceGender: VoiceGender; award: (n: number) => void }) {
  const runDue = useServerFn(getDueReviews);
  const runGrade = useServerFn(gradeReview);
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<any[]>([]);
  const [idx, setIdx] = useState(0);
  const [show, setShow] = useState(false);

  useEffect(() => {
    (async () => { setLoading(true); try { const r = await runDue({ data: { lang } }); setItems(r.reviews ?? []); } catch (e) { aiError(e); } finally { setLoading(false); } })();
    /* eslint-disable-next-line */
  }, [lang]);

  if (loading) return <Center />;
  if (!items.length) return <div className="rounded-2xl border border-dashed bg-card py-16 text-center text-muted-foreground">لا توجد كلمات للمراجعة الآن. تعلّم دروساً جديدة وستظهر هنا في موعدها. ✅</div>;
  if (idx >= items.length) return (
    <div className="rounded-2xl border bg-card p-8 text-center space-y-3">
      <Brain className="mx-auto size-12 text-primary" />
      <p className="font-semibold">أنهيت مراجعة اليوم! 🎉</p>
    </div>
  );

  const it = items[idx];
  const grade = async (correct: boolean) => {
    try { await runGrade({ data: { id: it.id, correct } }); } catch (e) { aiError(e); }
    if (correct) award(3);
    setShow(false); setIdx((i) => i + 1);
  };

  return (
    <div className="space-y-4">
      <div className="text-sm font-medium">المراجعة {idx + 1} / {items.length}</div>
      <div className="rounded-2xl border bg-card p-8 text-center space-y-3">
        <div className="text-2xl font-extrabold" dir="auto">{it.word}</div>
        <button onClick={() => speak(it.word, bcp47, voiceGender)} className="text-muted-foreground hover:text-primary"><Volume2 className="mx-auto size-5" /></button>
        {show ? <div className="text-lg text-primary">{it.translation}</div> : <Button variant="secondary" className="rounded-xl" onClick={() => setShow(true)}>أظهر المعنى</Button>}
      </div>
      {show && (
        <div className="grid grid-cols-2 gap-2">
          <Button onClick={() => grade(false)} variant="secondary" className="rounded-xl gap-1.5 border-destructive/40 text-destructive"><X className="size-4" /> نسيتها</Button>
          <Button onClick={() => grade(true)} className="rounded-xl gradient-primary text-primary-foreground gap-1.5"><Check className="size-4" /> أتذكّرها</Button>
        </div>
      )}
    </div>
  );
}

// ===================== الخطة اليومية =====================
function PlanView({ langName, level }: Shared) {
  const run = useServerFn(generateDailyPlan);
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<any>(null);
  useEffect(() => {
    (async () => { setLoading(true); try { setData(await run({ data: { level, targetLang: langName } })); } catch (e) { aiError(e); } finally { setLoading(false); } })();
    /* eslint-disable-next-line */
  }, [langName, level]);
  if (loading) return <Center />;
  if (!data) return <p className="text-sm text-destructive">تعذّر إنشاء الخطة.</p>;
  return (
    <div className="space-y-3">
      <h2 className="text-xl font-bold">خطة اليوم</h2>
      {data.summary && <p className="rounded-2xl bg-primary/10 p-3 text-sm text-primary">{data.summary}</p>}
      {(data.tasks ?? []).map((t: any, i: number) => (
        <div key={i} className="flex items-center justify-between rounded-xl border bg-card p-3">
          <div><div className="font-medium">{t.title}</div><div className="text-xs text-muted-foreground">{t.skill}</div></div>
          <span className="rounded-full bg-secondary px-2 py-0.5 text-xs">{t.minutes} د</span>
        </div>
      ))}
    </div>
  );
}

// ===================== الحوارات =====================
const SCENARIOS = ["محادثة يومية في المقهى", "محادثة عمل واجتماع", "مقابلة وظيفية", "في المطار والسفر", "عند الطبيب", "التسوق"];
function DialogueView({ langName, bcp47, voiceGender, level }: Shared) {
  const run = useServerFn(generateDialogue);
  const [scenario, setScenario] = useState(SCENARIOS[0]);
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<any>(null);
  const load = async (s: string) => {
    setScenario(s); setLoading(true); setData(null);
    try { setData(await run({ data: { level, targetLang: langName, scenario: s } })); } catch (e) { aiError(e); } finally { setLoading(false); }
  };
  useEffect(() => { load(SCENARIOS[0]); /* eslint-disable-next-line */ }, [langName, level]);
  return (
    <div className="space-y-3">
      <h2 className="text-xl font-bold">محادثات</h2>
      <div className="flex flex-wrap gap-1.5">
        {SCENARIOS.map((s) => <button key={s} onClick={() => load(s)} className={`rounded-xl border px-3 py-1.5 text-xs ${scenario === s ? "gradient-primary text-primary-foreground" : "bg-card text-muted-foreground"}`}>{s}</button>)}
      </div>
      {loading && <Center />}
      {!loading && data && (
        <div className="space-y-2">
          <div className="font-bold">{data.title}</div>
          {(data.lines ?? []).map((l: any, i: number) => (
            <div key={i} className={`flex gap-2 ${l.speaker === "B" ? "flex-row-reverse" : ""}`}>
              <div className={`max-w-[80%] rounded-2xl p-3 ${l.speaker === "B" ? "bg-primary/10" : "bg-card border"}`}>
                <div className="flex items-center gap-2"><span className="font-medium" dir="auto">{l.text}</span><button onClick={() => speak(l.text, bcp47, voiceGender)} className="text-muted-foreground hover:text-primary"><Volume2 className="size-4" /></button></div>
                <div className="text-xs text-muted-foreground">{l.translation}</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Center() {
  return <div className="flex justify-center py-16"><Loader2 className="size-8 animate-spin text-primary" /></div>;
}
