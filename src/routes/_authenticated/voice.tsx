import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
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
import { useLiveVoice, type LiveEvent } from "@/hooks/use-live-voice";
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
  const tokenRef = useRef<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    void supabase.auth.getSession().then(({ data }) => {
      tokenRef.current = data.session?.access_token ?? null;
    });
    const { data } = supabase.auth.onAuthStateChange((_e, s) => {
      tokenRef.current = s?.access_token ?? null;
    });
    return () => data.subscription.unsubscribe();
  }, []);

  const onEvent = (event: LiveEvent) => {
    const t = event.type;
    if (t !== "session.input_transcript.delta" && t !== "session.output_transcript.delta") return;
    const delta = typeof event.delta === "string" ? event.delta : "";
    if (!delta) return;
    const role: Row["role"] = t === "session.input_transcript.delta" ? "user" : "ai";
    setRows((prev) => {
      const last = prev[prev.length - 1];
      if (last && last.role === role) {
        return [...prev.slice(0, -1), { ...last, text: last.text + delta }];
      }
      return [...prev, { id: crypto.randomUUID(), role, text: delta }];
    });
  };

  const call = useLiveVoice({
    onEvent,
    startPayload: () => ({
      token: tokenRef.current,
      context: {
        targetLangName: langName,
        nativeLangName: nativeName,
        scenario: scenarioById(scenario)?.prompt,
        student: buildStudentContext(studentProfile) || undefined,
        // صوت المعلم عكس جنس الطالب
        voice: gender === "male" ? "marin" : "cedar",
      },
    }),
  });

  const live = call.status === "connected";
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
          : "متصل — تحدّث بشكل طبيعي، ويمكنك مقاطعة المعلم في أي وقت"
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
          {call.playbackBlocked && (
            <Button variant="secondary" onClick={call.resumePlayback}>
              <Volume2 className="size-4" /> تشغيل صوت المعلم
            </Button>
          )}
        </div>

        <audio ref={call.audioRef} autoPlay className="hidden" />

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
              <div key={r.id} className={`flex ${r.role === "user" ? "justify-start" : "justify-end"}`}>
                <div
                  dir="auto"
                  className={`max-w-[85%] rounded-2xl px-3 py-2 ${
                    r.role === "user" ? "gradient-primary text-primary-foreground" : "border bg-background"
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
            <Button size="lg" className="rounded-full gradient-primary text-primary-foreground" onClick={start}>
              <Phone className="size-5" /> ابدأ المكالمة
            </Button>
          ) : (
            <>
              <Button
                size="icon"
                variant="secondary"
                className="size-12 rounded-full"
                disabled={!live}
                onClick={() => call.setMuted(!call.muted)}
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
