import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  startLiveTranscript,
  createSpeechStreamer,
  startMicMeter,
  stopSpeaking,
  type VoiceGender,
} from "@/lib/speech";
import { useUserGender, useAppLang, useNativeLangName, useStudentProfile, buildStudentContext } from "@/lib/prefs";
import { langByCode } from "@/lib/languages";
import { SCENARIOS, scenarioById } from "@/lib/scenarios";
import { Button } from "@/components/ui/button";
import { Mic, PhoneOff, Loader2, Radio, Sparkles } from "lucide-react";

export const Route = createFileRoute("/_authenticated/voice")({
  head: () => ({
    meta: [
      { title: "المحادثة الصوتية المباشرة — ترجملي" },
      { name: "description", content: "تحدّث مباشرة مع المعلم الذكي بصوتك، بدون أزرار، مع مقاطعة فورية وترجمة حسب لغتك." },
      { property: "og:title", content: "المحادثة الصوتية المباشرة — ترجملي" },
      { property: "og:description", content: "محادثة صوتية لحظية مع معلّم لغة ذكي." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: VoicePage,
});

type Phase = "idle" | "connecting" | "listening" | "thinking" | "speaking";

const SILENCE_MS = 1200;

function Visualizer({ phase, level }: { phase: Phase; level: number }) {
  const bars = 9;
  const speaking = phase === "speaking";
  return (
    <div className="flex h-40 items-end justify-center gap-2">
      {Array.from({ length: bars }).map((_, i) => {
        const mid = Math.abs(i - (bars - 1) / 2);
        const wave = speaking ? 0.45 + 0.55 * Math.cos((mid / bars) * Math.PI) : level * (1 - mid / bars) + 0.08;
        const h = Math.max(10, Math.min(140, wave * 140));
        return (
          <span
            key={i}
            className={`w-3 rounded-full transition-all duration-100 ${
              speaking ? "bg-primary animate-pulse" : phase === "listening" ? "bg-accent" : "bg-muted-foreground/30"
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
  const [aiText, setAiText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [scenario, setScenario] = useState<string>("");

  const activeRef = useRef(false);
  const phaseRef = useRef<Phase>("idle");
  const stopMeterRef = useRef<() => void>(() => {});
  const stopRecRef = useRef<() => void>(() => {});
  const streamerRef = useRef<ReturnType<typeof createSpeechStreamer> | null>(null);
  const silenceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingRef = useRef("");

  const setPhaseSafe = (p: Phase) => {
    phaseRef.current = p;
    setPhase(p);
  };

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
    stopRecRef.current = startLiveTranscript(bcp47, (t) => {
      if (!activeRef.current) return;
      pendingRef.current = t;
      setUserText(t);
      if (silenceTimer.current) clearTimeout(silenceTimer.current);
      silenceTimer.current = setTimeout(() => {
        const text = pendingRef.current.trim();
        if (text) void sendTurn(text);
      }, SILENCE_MS);
    });
  };

  const sendTurn = async (text: string) => {
    if (!activeRef.current) return;
    stopRecRef.current();
    stopRecRef.current = () => {};
    if (silenceTimer.current) clearTimeout(silenceTimer.current);
    setPhaseSafe("thinking");
    setAiText("");
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
      if (!res.ok || !res.body) throw new Error("AI");

      const streamer = createSpeechStreamer(bcp47, voice, () => {
        streamerRef.current = null;
        if (activeRef.current) startListening();
      });
      streamerRef.current = streamer;
      setPhaseSafe("speaking");

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
              setAiText((p) => p + delta);
              if (streamerRef.current === streamer) streamer.push(delta);
            }
          } catch {
            /* إطار جزئي */
          }
        }
      }
      if (streamerRef.current === streamer) streamer.end();
    } catch (e: any) {
      const msg = String(e?.message ?? "");
      setError(
        msg.includes("RATE_LIMIT")
          ? "تم تجاوز حد الطلبات، حاول بعد قليل."
          : msg.includes("CREDITS")
            ? "نفد الرصيد. يرجى ترقية الخطة لإضافة رصيد."
            : "تعذّر الاتصال بالمعلّم الصوتي.",
      );
      if (activeRef.current) startListening();
    }
  };

  const start = async () => {
    setError(null);
    setAiText("");
    setUserText("");
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
    stopRecRef.current();
    stopRecRef.current = () => {};
    stopMeterRef.current();
    stopMeterRef.current = () => {};
    stopAiAudio();
    setLevel(0);
    setPhaseSafe("idle");
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
            : "اضغط لبدء المحادثة";

  return (
    <div className="space-y-5">
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

      <div className="rounded-3xl border bg-card p-6 shadow-sm">
        <Visualizer phase={phase} level={level} />
        <div className="mt-4 flex items-center justify-center gap-2 text-sm font-semibold text-muted-foreground">
          {(phase === "connecting" || phase === "thinking") && <Loader2 className="size-4 animate-spin" />}
          {statusText}
        </div>

        <div className="mt-5 space-y-3">
          {userText && (
            <div className="ms-auto max-w-[85%] rounded-2xl bg-primary/10 px-4 py-2 text-sm">
              <span className="block text-xs text-muted-foreground">أنت</span>
              {userText}
            </div>
          )}
          {aiText && (
            <div className="me-auto max-w-[85%] rounded-2xl bg-muted px-4 py-2 text-sm">
              <span className="block text-xs text-muted-foreground">المعلم</span>
              {aiText}
            </div>
          )}
        </div>

        {error && <p className="mt-4 text-center text-sm text-destructive">{error}</p>}

        <div className="mt-6 flex justify-center">
          {phase === "idle" ? (
            <Button size="lg" className="rounded-2xl gap-2 px-8" onClick={() => void start()}>
              <Mic className="size-5" /> ابدأ المحادثة
            </Button>
          ) : (
            <Button size="lg" variant="destructive" className="rounded-2xl gap-2 px-8" onClick={stop}>
              <PhoneOff className="size-5" /> إنهاء المحادثة
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
