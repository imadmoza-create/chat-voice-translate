import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  startLiveTranscript,
  createSpeechStreamer,
  startMicMeter,
  stopSpeaking,
  speak,
  type VoiceGender,
} from "@/lib/speech";
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
import {
  Mic,
  MicOff,
  PhoneOff,
  Loader2,
  Radio,
  Sparkles,
  Wifi,
  WifiOff,
  RefreshCw,
  Volume2,
  VolumeX,
  Pause,
  Play,
  RotateCcw,
  Gauge,
  Volume1,
} from "lucide-react";

export const Route = createFileRoute("/_authenticated/voice")({
  head: () => ({
    meta: [
      { title: "المحادثة الصوتية المباشرة — ترجملي" },
      {
        name: "description",
        content: "تحدّث مباشرة مع المعلم الذكي بصوتك، بدون أزرار، مع مقاطعة فورية وترجمة حسب لغتك.",
      },
      { property: "og:title", content: "المحادثة الصوتية المباشرة — ترجملي" },
      { property: "og:description", content: "محادثة صوتية لحظية مع معلّم لغة ذكي." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: VoicePage,
});

type Phase = "idle" | "connecting" | "listening" | "thinking" | "speaking" | "paused";
type Turn = { id: number; role: "user" | "ai"; text: string };

const SILENCE_MS = 1200;
const SPEEDS = [0.8, 1, 1.2] as const;

function fmtTime(s: number) {
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${String(r).padStart(2, "0")}`;
}

function Visualizer({ phase, level }: { phase: Phase; level: number }) {
  const bars = 11;
  const speaking = phase === "speaking";
  const listening = phase === "listening";
  return (
    <div className="flex h-32 items-center justify-center gap-1.5">
      {Array.from({ length: bars }).map((_, i) => {
        const mid = Math.abs(i - (bars - 1) / 2);
        const wave = speaking
          ? 0.45 + 0.55 * Math.cos((mid / bars) * Math.PI)
          : listening
            ? level * (1 - mid / bars) + 0.08
            : 0.08;
        const h = Math.max(8, Math.min(120, wave * 120));
        return (
          <span
            key={i}
            className={`w-2.5 rounded-full transition-all duration-100 ${
              speaking
                ? "bg-primary animate-pulse"
                : listening
                  ? "bg-accent"
                  : "bg-muted-foreground/25"
            }`}
            style={{ height: `${h}px`, animationDelay: `${i * 70}ms` }}
          />
        );
      })}
    </div>
  );
}

function VoicePage() {
  const [lang] = useAppLang();
  const [gender] = useUserGender();
  const nativeName = useNativeLangName();
  const [studentProfile] = useStudentProfile();
  const langInfo = langByCode(lang);
  const bcp47 = langInfo?.bcp47 ?? "en-US";
  const langName = langInfo?.name ?? "English";
  // صوت المدرّس عكس جنس الطالب
  const voice: VoiceGender = gender === "male" ? "female" : "male";

  const [phase, setPhase] = useState<Phase>("idle");
  const [level, setLevel] = useState(0);
  const [userText, setUserText] = useState("");
  const [turns, setTurns] = useState<Turn[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [scenario, setScenario] = useState<string>("");
  const [online, setOnline] = useState(true);
  const [speechIssue, setSpeechIssue] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);
  const [muted, setMuted] = useState(false);
  const [speed, setSpeed] = useState<number>(1);
  const [seconds, setSeconds] = useState(0);

  const activeRef = useRef(false);
  const phaseRef = useRef<Phase>("idle");
  const mutedRef = useRef(false);
  const speedRef = useRef(1);
  const stopMeterRef = useRef<() => void>(() => {});
  const stopRecRef = useRef<() => void>(() => {});
  const streamerRef = useRef<ReturnType<typeof createSpeechStreamer> | null>(null);
  const silenceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingRef = useRef("");
  // آخر جملة لم تُستكمل — تُستأنف تلقائياً بعد عودة الشبكة بدون فقد السياق
  const lastTurnRef = useRef<string | null>(null);
  const retryTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const turnIdRef = useRef(0);

  const setPhaseSafe = (p: Phase) => {
    phaseRef.current = p;
    setPhase(p);
  };

  mutedRef.current = muted;
  speedRef.current = speed;

  // مؤقّت المكالمة
  useEffect(() => {
    if (phase === "idle") return;
    const t = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, [phase === "idle"]);

  // تمرير تلقائي لآخر جملة
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [turns, userText]);

  // مراقبة حالة الشبكة
  useEffect(() => {
    setOnline(navigator.onLine);
    const up = () => {
      setOnline(true);
      // استئناف تلقائي للجملة المعلّقة فور عودة الاتصال
      if (activeRef.current && lastTurnRef.current) void sendTurn(lastTurnRef.current, 0);
    };
    const down = () => setOnline(false);
    window.addEventListener("online", up);
    window.addEventListener("offline", down);
    return () => {
      window.removeEventListener("online", up);
      window.removeEventListener("offline", down);
    };
  }, []);

  const stopAiAudio = () => {
    streamerRef.current?.cancel();
    streamerRef.current = null;
    stopSpeaking();
  };

  const startListening = () => {
    stopRecRef.current();
    pendingRef.current = "";
    setUserText("");
    setPhaseSafe("listening");
    stopRecRef.current = startLiveTranscript(
      bcp47,
      (t) => {
        if (!activeRef.current) return;
        setSpeechIssue(null);
        pendingRef.current = t;
        setUserText(t);
        if (silenceTimer.current) clearTimeout(silenceTimer.current);
        silenceTimer.current = setTimeout(() => {
          const text = pendingRef.current.trim();
          if (text) void sendTurn(text, 0);
        }, SILENCE_MS);
      },
      {
        onError: (code) => {
          setSpeechIssue(
            code === "not-allowed" || code === "service-not-allowed"
              ? "لم يُسمح باستخدام الميكروفون. فعّل الإذن من المتصفح."
              : code === "not-supported"
                ? "متصفحك لا يدعم التعرّف على الكلام. جرّب Chrome."
                : code === "network"
                  ? "تعذّر التعرّف على الكلام بسبب ضعف الشبكة — تتم إعادة المحاولة تلقائياً."
                  : "تعذّر التعرّف على الكلام — تتم إعادة المحاولة تلقائياً.",
          );
        },
        onRestart: () => {
          if (activeRef.current) setSpeechIssue(null);
        },
      },
    );
  };

  const sendTurn = async (text: string, attempt: number) => {
    if (!activeRef.current) return;
    lastTurnRef.current = text;
    stopRecRef.current();
    stopRecRef.current = () => {};
    if (silenceTimer.current) clearTimeout(silenceTimer.current);
    setPhaseSafe("thinking");
    setRetry(attempt);
    if (attempt === 0) {
      setUserText("");
      setTurns((prev) => [...prev, { id: ++turnIdRef.current, role: "user", text }]);
    }

    if (typeof navigator !== "undefined" && !navigator.onLine) {
      setOnline(false);
      setError("لا يوجد اتصال بالإنترنت — سيتم الاستئناف تلقائياً عند عودته.");
      return;
    }

    try {
      const { data: sess } = await supabase.auth.getSession();
      const token = sess.session?.access_token;
      if (!token) throw new Error("AUTH");
      const res = await fetch("/api/voice-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          text,
          targetLang: lang,
          targetLangName: langName,
          nativeLangName: nativeName,
          scenario: scenarioById(scenario)?.prompt,
          student: buildStudentContext(studentProfile) || undefined,
        }),
      });
      if (res.status === 429) throw new Error("RATE_LIMIT");
      if (res.status === 402) throw new Error("CREDITS");
      if (!res.ok || !res.body) throw new Error(res.status >= 500 ? "NETWORK" : "AI");

      const streamer = mutedRef.current
        ? null
        : createSpeechStreamer(
            bcp47,
            voice,
            () => {
              streamerRef.current = null;
              if (activeRef.current && phaseRef.current !== "paused") startListening();
            },
            speedRef.current,
          );
      streamerRef.current = streamer;
      setPhaseSafe("speaking");
      setError(null);
      setRetry(0);

      const aiId = ++turnIdRef.current;
      setTurns((prev) => [...prev, { id: aiId, role: "ai", text: "" }]);

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        if (!activeRef.current) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const payload = line.slice(6).trim();
          if (!payload || payload === "[DONE]") continue;
          try {
            const delta = JSON.parse(payload)?.choices?.[0]?.delta?.content;
            if (typeof delta === "string" && delta) {
              setTurns((prev) =>
                prev.map((t) => (t.id === aiId ? { ...t, text: t.text + delta } : t)),
              );
              if (streamer && streamerRef.current === streamer) streamer.push(delta);
            }
          } catch {
            /* إطار جزئي */
          }
        }
      }
      if (streamer) {
        if (streamerRef.current === streamer) streamer.end();
      } else if (activeRef.current && phaseRef.current !== "paused") {
        // الوضع الصامت: عد للاستماع مباشرة بعد انتهاء النص
        startListening();
      }
      lastTurnRef.current = null;
    } catch (e: any) {
      const msg = String(e?.message ?? "");
      const retryable = !msg.includes("CREDITS") && !msg.includes("AUTH");
      if (retryable && attempt < 3 && activeRef.current) {
        setError(`ضعف في الاتصال — إعادة المحاولة (${attempt + 1}/3)...`);
        setRetry(attempt + 1);
        if (retryTimer.current) clearTimeout(retryTimer.current);
        retryTimer.current = setTimeout(
          () => {
            void sendTurn(text, attempt + 1);
          },
          800 * Math.pow(2, attempt),
        );
        return;
      }
      setError(
        msg.includes("RATE_LIMIT")
          ? "تم تجاوز حد الطلبات، حاول بعد قليل."
          : msg.includes("CREDITS")
            ? "نفد الرصيد. يرجى ترقية الخطة لإضافة رصيد."
            : "تعذّر الاتصال بالمعلّم الصوتي — سيتم الاستئناف عند عودة الشبكة.",
      );
      setRetry(0);
      if (activeRef.current && phaseRef.current !== "paused") startListening();
    }
  };

  const start = async () => {
    setError(null);
    setTurns([]);
    setUserText("");
    setSeconds(0);
    activeRef.current = true;
    setPhaseSafe("connecting");
    stopMeterRef.current = await startMicMeter((l) => {
      setLevel(l);
      // مقاطعة فورية: أوقف صوت المعلّم لحظة بدء الطالب بالكلام
      if (l > 0.35 && phaseRef.current === "speaking") {
        stopAiAudio();
        startListening();
      }
    });
    startListening();
  };

  const stop = () => {
    activeRef.current = false;
    if (silenceTimer.current) clearTimeout(silenceTimer.current);
    if (retryTimer.current) clearTimeout(retryTimer.current);
    stopRecRef.current();
    stopRecRef.current = () => {};
    stopMeterRef.current();
    stopMeterRef.current = () => {};
    stopAiAudio();
    setLevel(0);
    setRetry(0);
    setSpeechIssue(null);
    setUserText("");
    lastTurnRef.current = null;
    setPhaseSafe("idle");
  };

  const togglePause = () => {
    if (!activeRef.current) return;
    if (phaseRef.current === "paused") {
      startListening();
      return;
    }
    if (silenceTimer.current) clearTimeout(silenceTimer.current);
    stopRecRef.current();
    stopRecRef.current = () => {};
    stopAiAudio();
    setUserText("");
    setLevel(0);
    setPhaseSafe("paused");
  };

  const toggleMute = () => {
    setMuted((m) => {
      const next = !m;
      if (next) {
        stopAiAudio();
        if (activeRef.current && phaseRef.current === "speaking") startListening();
      }
      return next;
    });
  };

  const lastAi = [...turns].reverse().find((t) => t.role === "ai" && t.text.trim());

  const repeatLast = () => {
    if (!lastAi) return;
    stopAiAudio();
    void speak(lastAi.text, bcp47, voice, undefined, speedRef.current);
  };

  const cycleSpeed = () => {
    setSpeed((s) => {
      const i = SPEEDS.indexOf(s as (typeof SPEEDS)[number]);
      return SPEEDS[(i + 1) % SPEEDS.length];
    });
  };

  useEffect(() => stop, []);

  const statusText =
    phase === "connecting"
      ? "جارِ التهيئة..."
      : phase === "listening"
        ? "جارِ الاستماع..."
        : phase === "thinking"
          ? "المعلم يفكّر..."
          : phase === "speaking"
            ? "المعلم يتحدث..."
            : phase === "paused"
              ? "المحادثة متوقفة مؤقتاً"
              : "اضغط لبدء المحادثة";

  const active = phase !== "idle";

  return (
    <div className="space-y-4">
      <div className="text-center">
        <h1 className="flex items-center justify-center gap-2 text-2xl font-extrabold text-gradient">
          <Radio className="size-6 text-primary" /> المحادثة الصوتية المباشرة
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          تحدّث بحرية بلغة {langName} — الشرح والتصحيح بلغتك ({nativeName}).
        </p>
      </div>

      {phase === "idle" && (
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

      {/* مؤشرات الشبكة والتعرّف على الكلام */}
      {!online && (
        <div className="flex items-center gap-2 rounded-2xl border border-destructive/40 bg-destructive/10 px-4 py-2.5 text-sm text-destructive">
          <WifiOff className="size-4 shrink-0" />
          لا يوجد اتصال بالإنترنت — ستُستأنف المحادثة تلقائياً من حيث توقفت.
        </div>
      )}
      {online && retry > 0 && (
        <div className="flex items-center gap-2 rounded-2xl border border-amber-500/40 bg-amber-500/10 px-4 py-2.5 text-sm text-amber-700 dark:text-amber-400">
          <RefreshCw className="size-4 shrink-0 animate-spin" />
          الشبكة ضعيفة — جارِ إعادة الاتصال ({retry}/3) واستئناف المحادثة.
        </div>
      )}
      {speechIssue && (
        <div className="flex items-center gap-2 rounded-2xl border border-amber-500/40 bg-amber-500/10 px-4 py-2.5 text-sm text-amber-700 dark:text-amber-400">
          <MicOff className="size-4 shrink-0" />
          {speechIssue}
        </div>
      )}

      <div className="overflow-hidden rounded-3xl border bg-card shadow-sm">
        {/* شريط الحالة العلوي */}
        <div className="flex items-center justify-between border-b bg-muted/40 px-4 py-2.5 text-xs font-semibold">
          <span className="flex items-center gap-1.5">
            <span
              className={`size-2 rounded-full ${
                phase === "idle"
                  ? "bg-muted-foreground/40"
                  : phase === "paused"
                    ? "bg-amber-500"
                    : "bg-emerald-500 animate-pulse"
              }`}
            />
            {active ? "متصل" : "غير متصل"}
          </span>
          <span className="tabular-nums text-muted-foreground">{fmtTime(seconds)}</span>
          <span className="flex items-center gap-1.5 text-muted-foreground">
            {online ? (
              <Wifi className="size-3.5 text-emerald-500" />
            ) : (
              <WifiOff className="size-3.5 text-destructive" />
            )}
            {muted ? <VolumeX className="size-3.5" /> : <Volume2 className="size-3.5" />}
          </span>
        </div>

        <div className="p-5">
          <Visualizer phase={phase} level={level} />
          <div className="mt-3 flex items-center justify-center gap-2 text-sm font-semibold text-muted-foreground">
            {(phase === "connecting" || phase === "thinking") && (
              <Loader2 className="size-4 animate-spin" />
            )}
            {statusText}
          </div>

          {/* سجل المحادثة الكامل */}
          <div
            ref={scrollRef}
            className="mt-4 max-h-72 space-y-2.5 overflow-y-auto rounded-2xl bg-muted/30 p-3"
          >
            {turns.length === 0 && !userText && (
              <p className="py-6 text-center text-xs text-muted-foreground">
                سيظهر هنا سجل المحادثة كاملاً — كلامك وردود المعلم.
              </p>
            )}
            {turns.map((t) =>
              t.role === "user" ? (
                <div
                  key={t.id}
                  className="ms-auto max-w-[85%] rounded-2xl bg-primary/10 px-4 py-2 text-sm"
                >
                  <span className="block text-xs text-muted-foreground">أنت</span>
                  {t.text}
                </div>
              ) : (
                <div key={t.id} className="me-auto max-w-[85%] rounded-2xl bg-card px-4 py-2 text-sm shadow-sm">
                  <span className="mb-0.5 flex items-center justify-between gap-2 text-xs text-muted-foreground">
                    المعلم
                    {t.text.trim() && (
                      <button
                        type="button"
                        onClick={() => {
                          stopAiAudio();
                          void speak(t.text, bcp47, voice, undefined, speedRef.current);
                        }}
                        className="text-primary hover:opacity-80"
                        aria-label="استمع مجدداً"
                      >
                        <Volume1 className="size-4" />
                      </button>
                    )}
                  </span>
                  {t.text || "…"}
                </div>
              ),
            )}
            {userText && (
              <div className="ms-auto max-w-[85%] rounded-2xl border border-dashed border-primary/40 bg-primary/5 px-4 py-2 text-sm">
                <span className="block text-xs text-muted-foreground">أنت (الآن)</span>
                {userText}
              </div>
            )}
          </div>

          {error && <p className="mt-3 text-center text-sm text-destructive">{error}</p>}

          {/* أدوات التحكّم أثناء المكالمة */}
          {active && (
            <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
              <Button
                type="button"
                size="sm"
                variant={muted ? "default" : "outline"}
                className="rounded-xl gap-1.5"
                onClick={toggleMute}
              >
                {muted ? <VolumeX className="size-4" /> : <Volume2 className="size-4" />}
                {muted ? "الصوت مكتوم" : "كتم الصوت"}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="rounded-xl gap-1.5"
                onClick={togglePause}
              >
                {phase === "paused" ? <Play className="size-4" /> : <Pause className="size-4" />}
                {phase === "paused" ? "متابعة" : "إيقاف مؤقت"}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="rounded-xl gap-1.5"
                onClick={repeatLast}
                disabled={!lastAi}
              >
                <RotateCcw className="size-4" /> أعد الجملة
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="rounded-xl gap-1.5"
                onClick={cycleSpeed}
              >
                <Gauge className="size-4" /> السرعة {speed}×
              </Button>
            </div>
          )}

          <div className="mt-5 flex justify-center">
            {phase === "idle" ? (
              <Button size="lg" className="rounded-2xl gap-2 px-8" onClick={() => void start()}>
                <Mic className="size-5" /> ابدأ المحادثة
              </Button>
            ) : (
              <Button
                size="lg"
                variant="destructive"
                className="rounded-2xl gap-2 px-8"
                onClick={stop}
              >
                <PhoneOff className="size-5" /> إنهاء المحادثة
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
