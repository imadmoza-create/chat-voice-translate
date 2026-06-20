import { createFileRoute } from "@tanstack/react-router";
import { Settings as SettingsIcon, Languages, Volume2 } from "lucide-react";
import { LANGUAGES, langByCode } from "@/lib/languages";
import { useAppLang, useUserGender, detectDeviceLang } from "@/lib/prefs";

export const Route = createFileRoute("/_authenticated/settings")({
  head: () => ({ meta: [{ title: "الإعدادات — ترجملي" }] }),
  component: SettingsPage,
});

function SettingsPage() {
  const [lang, setLang] = useAppLang();
  const [gender, setGender] = useUserGender();
  const deviceLang = detectDeviceLang();
  const voiceGender = gender === "male" ? "female" : "male";

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <SettingsIcon className="size-6 text-primary" />
        <h1 className="text-2xl font-bold">الإعدادات</h1>
      </div>

      <div className="space-y-2 rounded-2xl border bg-card p-5">
        <div className="flex items-center gap-2 font-bold">
          <Languages className="size-5 text-primary" /> لغة التعلّم
        </div>
        <p className="text-sm text-muted-foreground">
          هذه اللغة تُستخدم في كل أقسام التطبيق (الكلمات، الأفعال، الاختبار).
          اللغة الافتراضية مأخوذة من لغة هاتفك: <span className="font-medium text-foreground">{langByCode(deviceLang)?.nameAr ?? deviceLang}</span>
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
      </div>

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
    </div>
  );
}
