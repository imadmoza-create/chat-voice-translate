import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import {
  useUserGender,
  useAppLang,
  useNativeLangName,
  useStudentProfile,
  buildStudentContext,
} from "@/lib/prefs";
import { langByCode } from "@/lib/languages";
import { SCENARIOS, scenarioById } from "@/lib/scenarios";
import { Button } from "@/components/ui/button";
import { VoiceDiagnostics } from "@/components/VoiceDiagnostics";
import { useFreeCall, type FreeCallTurn } from "@/hooks/use-free-call";
import { Mic, MicOff, PhoneOff, Phone, Loader2, Radio, Sparkles, Volume2 } from "lucide-react";

export const Route = createFileRoute("/_authenticated/voice")({
  head: () => ({
    meta: [
      { title: "المحادثة الصوتية المباشرة — ترجملي" },
      {
        name: "description",
        content: "مكالمة صوتية طبيعية مع معلم لغة ذكي يتكلم ويستمع مثل شخص حقيقي.",
      },
      { property: "og:title", content: "المحادثة الصوتية المباشرة — ترجملي" },
      { property: "og:description", content: "مكالمة صوتية لحظية مع معلّم لغة ذكي." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: VoicePage,
});

type Row = { id: string; role: "user" | "ai"; text: string };

function fmtTime(s: number) {
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

function VoicePage() {
  const [lang] = useAppLang();
  const [gender] = useUserGender();
  const nativeName = useNativeLangName();
  const [studentProfile] = useStudentProfile();
  const langName = langByCode(lang)?.name ?? "English";
  const [scenario, setScenario] = useState("");
  const [rows, setRows] = useState<Row[]>([]);
  const [seconds, setSeconds] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);

  const onTurn = (t: FreeCallTurn) =>
    setRows((prev) => [...prev, { id: crypto.randomUUID(), role: t.role, text: t.text }]);

  const call = useFreeCall({
    bcp47: langByCode(lang)?.bcp47 ?? "en-US",
    gender,
    onTurn,
    payload: () => ({
      targetLang: lang,
      targetLangName: langName,
      nativeLangName: nativeName,
      scenario: scenarioById(scenario)?.prompt,
      student: buildStudentContext(studentProfile) || undefined,
    }),
  });

  const live = ["connected", "speaking", "listening"].includes(call.status);
  const busy = call.status === "connecting" || call.status === "stopping";
  const canStart = call.status === "idle" || call.status === "closed";

  useEffect(() => {
    if (!live) return;
    setSeconds(0);
    const id = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(id);
  }, [live]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [rows]);

  const start = () => {
    setRows([]);
    call.start();
  };

  const statusText =
    call.status === "connecting"
      ? "جارٍ الاتصال بالمعلم..."
      : live
        ? call.muted
          ? "الميكروفون مكتوم"
          : call.status === "speaking"
            ? "المعلم يتكلم — اضغط الميكروفون لمقاطعته"
            : call.status === "listening"
              ? "أستمع إليك — تحدّث بشكل طبيعي"
              : "متصل"
        : call.status === "stopping"
          ? "جارٍ إنهاء المكالمة..."
          : "اضغط لبدء المكالمة";

  return (
    <div className="space-y-4">
      <div className="text-center">
        <h1 className="flex items-center justify-center gap-2 text-2xl font-extrabold text-gradient">
          <Radio className="size-6 text-primary" /> المحادثة الصوتية المباشرة
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          مكالمة طبيعية بلغة {langName} — والشرح عند الحاجة بلغتك ({nativeName}).
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          المكالمة مجانية وتستخدم ميكروفون جهازك وصوته.
        </p>
      </div>

      {canStart && (
        <div className="rounded-2xl border bg-card p-4">
          <label className="mb-2 flex items-center gap-1.5 text-sm font-semibold">
            <Sparkles className="size-4 text-primary" /> سيناريو التدريب (اختياري)
          </label>
          <select
            value={scenario}
            onChange={(e) => setScenario(e.target.value)}
            className="w-full rounded-xl border bg-background px-3 py-2 text-sm"
          >
            <option value="">محادثة حرة</option>
            {SCENARIOS.map((s) => (
              <option key={s.id} value={s.id}>
                {s.titleAr}
              </option>
            ))}
          </select>
        </div>
      )}

      <div className="rounded-2xl border bg-card p-4">
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <span
              className={`size-2 rounded-full ${live ? "bg-primary animate-pulse" : "bg-muted-foreground/40"}`}
            />
            {live ? "في مكالمة" : "غير متصل"}
          </span>
          <span>{live ? fmtTime(seconds) : ""}</span>
        </div>

        <div className="flex flex-col items-center gap-3 py-6">
          <span
            className={`flex size-24 items-center justify-center rounded-full gradient-primary text-primary-foreground shadow-glow ${live ? "animate-pulse" : ""}`}
          >
            {busy ? <Loader2 className="size-10 animate-spin" /> : <Volume2 className="size-10" />}
          </span>
          <p className="text-center text-sm">{statusText}</p>
          {call.error && <p className="text-center text-sm text-destructive">{call.error}</p>}
        </div>

        <div
          ref={scrollRef}
          className="max-h-72 space-y-2 overflow-y-auto rounded-xl bg-muted/40 p-3 text-sm"
        >
          {rows.length === 0 ? (
            <p className="text-center text-xs text-muted-foreground">
              هنا يظهر نص المكالمة — كلامك وردود المعلم.
            </p>
          ) : (
            rows.map((r) => (
              <div
                key={r.id}
                className={`flex ${r.role === "user" ? "justify-start" : "justify-end"}`}
              >
                <div
                  dir="auto"
                  className={`max-w-[85%] rounded-2xl px-3 py-2 ${
                    r.role === "user"
                      ? "gradient-primary text-primary-foreground"
                      : "border bg-background"
                  }`}
                >
                  {r.text}
                </div>
              </div>
            ))
          )}
        </div>

        <div className="mt-4 flex items-center justify-center gap-3">
          {canStart ? (
            <Button
              size="lg"
              className="rounded-full gradient-primary text-primary-foreground"
              onClick={start}
            >
              <Phone className="size-5" /> ابدأ المكالمة
            </Button>
          ) : (
            <>
              <Button
                size="icon"
                variant="secondary"
                className="size-12 rounded-full"
                disabled={!live}
                onClick={() =>
                  call.status === "speaking" ? call.interrupt() : call.setMuted(!call.muted)
                }
                title={call.muted ? "إلغاء الكتم" : "كتم الميكروفون"}
              >
                {call.muted ? <MicOff className="size-5" /> : <Mic className="size-5" />}
              </Button>
              <Button
                size="icon"
                variant="destructive"
                className="size-14 rounded-full"
                disabled={call.status === "stopping"}
                onClick={call.stop}
                title="إنهاء المكالمة"
              >
                <PhoneOff className="size-6" />
              </Button>
            </>
          )}
        </div>
      </div>

      <VoiceDiagnostics />
    </div>
  );
}
