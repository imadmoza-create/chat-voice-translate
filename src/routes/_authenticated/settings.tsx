import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Settings as SettingsIcon, Languages, Volume2, Smartphone, Eye, Loader2, GraduationCap } from "lucide-react";
import { LANGUAGES, langByCode } from "@/lib/languages";
import { useAppLang, useUserGender, detectDeviceLang } from "@/lib/prefs";
import { speak, type VoiceGender } from "@/lib/speech";
import { translateText } from "@/lib/translate.functions";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated/settings")({
  head: () => ({ meta: [{ title: "الإعدادات — ترجملي" }] }),
  component: SettingsPage,
});

// أمثلة معاينة قصيرة مع رمز توضيحي
const PREVIEW_SAMPLES = [
  { emoji: "👋", ar: "مرحباً، كيف حالك؟" },
  { emoji: "🙏", ar: "شكراً جزيلاً لك" },
  { emoji: "🍎", ar: "أريد أن أتعلم لغة جديدة" },
];

function SettingsPage() {
  const [lang, setLang] = useAppLang();
  const [gender, setGender] = useUserGender();
  const deviceLang = detectDeviceLang();
  const voiceGender: VoiceGender = gender === "male" ? "female" : "male";

  const runTranslate = useServerFn(translateText);
  const [sampleIdx, setSampleIdx] = useState(0);
  const [preview, setPreview] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const sample = PREVIEW_SAMPLES[sampleIdx];
  const targetLang = langByCode(lang);
  const bcp47 = targetLang?.bcp47 ?? "en-US";

  async function loadPreview(idx = sampleIdx) {
    setSampleIdx(idx);
    setLoading(true);
    setPreview("");
    try {
      const res = await runTranslate({
        data: { text: PREVIEW_SAMPLES[idx].ar, targetLang: targetLang?.name ?? "English" },
      });
      const text = res.translation || "";
      setPreview(text);
      if (text) speak(text, bcp47, voiceGender);
    } catch {
      setPreview("تعذّر تحميل المعاينة، حاول مجدداً.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <SettingsIcon className="size-6 text-primary" />
        <h1 className="text-2xl font-bold">الإعدادات</h1>
      </div>

      {/* لغة التعلّم */}
      <div className="space-y-2 rounded-2xl border bg-card p-5">
        <div className="flex items-center gap-2 font-bold">
          <Languages className="size-5 text-primary" /> لغة التعلّم
        </div>
        <p className="text-sm text-muted-foreground">
          هذه اللغة تُستخدم في كل أقسام التطبيق (الكلمات، الأفعال، الاختبار).
          اللغة الأساسية الافتراضية مأخوذة من لغة هاتفك:{" "}
          <span className="font-medium text-foreground">{langByCode(deviceLang)?.nameAr ?? deviceLang}</span>
        </p>
        <select
          value={lang}
          onChange={(e) => setLang(e.target.value)}
          className="mt-2 w-full rounded-xl border bg-background px-3 py-2.5 font-medium outline-none focus:ring-2 focus:ring-primary"
        >
          {LANGUAGES.map((l) => (
            <option key={l.code} value={l.code}>
              {l.nameAr} {l.code === deviceLang ? "(لغة الهاتف)" : ""}
            </option>
          ))}
        </select>
        <Button
          variant="secondary"
          size="sm"
          className="mt-2 gap-1.5 rounded-xl"
          disabled={lang === deviceLang}
          onClick={() => setLang(deviceLang)}
        >
          <Smartphone className="size-4" /> استخدام لغة الهاتف
        </Button>
      </div>

      {/* الجنس */}
      <div className="space-y-2 rounded-2xl border bg-card p-5">
        <div className="flex items-center gap-2 font-bold">
          <Volume2 className="size-5 text-primary" /> جنسك
        </div>
        <p className="text-sm text-muted-foreground">
          يُنطق الصوت بعكس جنسك — الصوت الحالي: {voiceGender === "female" ? "مؤنث" : "مذكر"}
        </p>
        <div className="mt-2 flex items-center gap-1 rounded-xl bg-muted p-1">
          <button onClick={() => setGender("male")} className={`flex-1 rounded-lg px-3 py-2 font-medium ${gender === "male" ? "bg-card shadow-sm" : "text-muted-foreground"}`}>ذكر</button>
          <button onClick={() => setGender("female")} className={`flex-1 rounded-lg px-3 py-2 font-medium ${gender === "female" ? "bg-card shadow-sm" : "text-muted-foreground"}`}>أنثى</button>
        </div>
      </div>

      {/* شاشة المعاينة */}
      <div className="space-y-3 rounded-2xl border bg-card p-5">
        <div className="flex items-center gap-2 font-bold">
          <Eye className="size-5 text-primary" /> معاينة قبل البدء
        </div>
        <p className="text-sm text-muted-foreground">
          جرّب مثال ترجمة بالصوت والصورة باللغة الحالية ({targetLang?.nameAr ?? lang}) قبل بدء الاختبار.
        </p>

        <div className="flex flex-col items-center gap-3 rounded-2xl border bg-background p-5 text-center">
          <div className="text-6xl leading-none">{sample.emoji}</div>
          <div className="font-bold" dir="rtl">{sample.ar}</div>
          {loading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" /> جارٍ الترجمة…
            </div>
          ) : preview ? (
            <div className="text-lg font-medium text-primary" dir="auto">{preview}</div>
          ) : (
            <div className="text-sm text-muted-foreground">اضغط للمعاينة بالصوت</div>
          )}

          <div className="mt-1 flex flex-wrap items-center justify-center gap-2">
            <Button size="sm" className="gap-1.5 rounded-xl" onClick={() => loadPreview()} disabled={loading}>
              <Volume2 className="size-4" /> ترجمة واستماع
            </Button>
            {preview && !loading && (
              <Button variant="secondary" size="sm" className="gap-1.5 rounded-xl" onClick={() => speak(preview, bcp47, voiceGender)}>
                <Volume2 className="size-4" /> إعادة الصوت
              </Button>
            )}
          </div>
        </div>

        <div className="flex items-center justify-center gap-1">
          {PREVIEW_SAMPLES.map((s, i) => (
            <button
              key={i}
              onClick={() => loadPreview(i)}
              className={`flex size-10 items-center justify-center rounded-xl border text-xl ${i === sampleIdx ? "border-primary bg-primary/10" : "bg-background"}`}
            >
              {s.emoji}
            </button>
          ))}
        </div>

        <Button asChild variant="outline" className="w-full gap-1.5 rounded-xl">
          <Link to="/learn">
            <GraduationCap className="size-4" /> ابدأ الاختبار الآن
          </Link>
        </Button>
      </div>
    </div>
  );
}
