import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import { useServerFn } from "@tanstack/react-start";
import {
  getChatMessages,
  sendChatMessage,
  clearChat,
  transcribeAudio,
  assessConversation,
  type ChatMessage,
  type Correction,
  type ConversationScore,
} from "@/lib/chat.functions";
import { getProgress } from "@/lib/academy.functions";
import { speak, stopSpeaking, startLiveTranscript, createSpeechStreamer, startBargeInDetector, type VoiceGender } from "@/lib/speech";
import { supabase } from "@/integrations/supabase/client";
import { usePersistedState } from "@/lib/persisted-state";
import { useUserGender, useAppLang, useStudentProfile, buildStudentContext } from "@/lib/prefs";
import { langByCode } from "@/lib/languages";
import { SCENARIOS, scenarioById } from "@/lib/scenarios";
import { assessPronunciation, type PronunciationResult } from "@/lib/pronunciation";
import { Button } from "@/components/ui/button";
import {
  GraduationCap,
  Send,
  Mic,
  Square,
  Volume2,
  VolumeX,
  Trash2,
  Loader2,
  Languages,
  CheckCircle2,
  Sparkles,
  Award,
  X,
  Radio,
} from "lucide-react";

export const Route = createFileRoute("/_authenticated/chat")({
  head: () => ({ meta: [{ title: "المدرّس الذكي — ترجملي" }] }),
  component: ChatPage,
});

// رسالة تشغيل مخفية لبدء المحادثة الصوتية المباشرة
const LIVE_MARK = "⟪live⟫";

type Extra = { translation?: string; correction?: Correction | null; xpGain?: number };

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = reject;
    r.readAsDataURL(blob);
  });
}

// ============ تدريب النطق: أعد نطق الجملة المصححة وقيّم دقتك ============
function PronunciationPractice({
  target,
  bcp47,
  gender,
  lang,
  transcribe,
  onScore,
}: {
  target: string;
  bcp47: string;
  gender: VoiceGender;
  lang: string;
  transcribe: (args: { data: { audio: string; mime: string; lang: string } }) => Promise<{ text: string }>;
  onScore?: (accuracy: number) => void;
}) {
  const [recording, setRecording] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<PronunciationResult | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const recRef = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);

  const start = async () => {
    setErr(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mime = MediaRecorder.isTypeSupported("audio/webm")
        ? "audio/webm"
        : MediaRecorder.isTypeSupported("audio/mp4")
          ? "audio/mp4"
          : "";
      const rec = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream);
      chunks.current = [];
      rec.ondataavailable = (ev) => ev.data.size > 0 && chunks.current.push(ev.data);
      rec.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunks.current, { type: rec.mimeType || "audio/webm" });
        if (blob.size < 1200) {
          setErr("التسجيل قصير جداً، حاول مجدداً.");
          return;
        }
        setBusy(true);
        try {
          const dataUrl = await blobToDataUrl(blob);
          const { text } = await transcribe({ data: { audio: dataUrl, mime: rec.mimeType, lang } });
          if (text) {
            const r = assessPronunciation(target, text);
            setResult(r);
            onScore?.(r.accuracy);
          } else setErr("لم أتمكّن من سماع نطقك بوضوح.");
        } catch {
          setErr("تعذّر تحليل النطق.");
        } finally {
          setBusy(false);
        }
      };
      recRef.current = rec;
      rec.start();
      setRecording(true);
    } catch {
      setErr("يرجى السماح بالوصول إلى الميكروفون.");
    }
  };
  const stop = () => {
    recRef.current?.stop();
    setRecording(false);
  };

  return (
    <div className="space-y-2 rounded-lg border border-dashed bg-background/60 px-2 py-2" dir="rtl">
      <p className="text-xs font-semibold text-primary">🎯 تدرّب على النطق</p>
      <div className="flex flex-wrap items-center gap-1.5">
        <button
          type="button"
          onClick={() => speak(target, bcp47, gender)}
          className="rounded-full border bg-card px-3 py-1 text-xs hover:border-primary hover:text-primary"
        >
          🔊 اسمع النطق الصحيح
        </button>
        <button
          type="button"
          onClick={recording ? stop : start}
          disabled={busy}
          className={`rounded-full px-3 py-1 text-xs text-primary-foreground disabled:opacity-60 ${
            recording ? "bg-destructive" : "gradient-primary"
          }`}
        >
          {busy ? "جارٍ التحليل..." : recording ? "■ أوقف التسجيل" : "🎙️ سجّل نطقك"}
        </button>
      </div>
      {err && <p className="text-xs text-destructive">{err}</p>}
      {result && (
        <div className="space-y-1.5">
          <div className="flex items-center gap-2">
            <span className={`text-lg font-bold ${result.color}`}>{result.accuracy}%</span>
            <span className={`text-xs font-semibold ${result.color}`}>{result.label}</span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
            <div
              className="h-full gradient-primary transition-all"
              style={{ width: `${result.accuracy}%` }}
            />
          </div>
          <p className="text-[11px] text-muted-foreground">
            دقة الكلمات {result.wordAccuracy}% · دقة الحروف {result.charAccuracy}%
          </p>
          <div className="flex flex-wrap gap-1" dir="auto">
            {result.words.map((w, i) => (
              <span
                key={i}
                className={`rounded px-1.5 py-0.5 text-xs ${
                  w.correct
                    ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
                    : "bg-destructive/15 text-destructive line-through"
                }`}
              >
                {w.word}
              </span>
            ))}
          </div>
          {result.heard && (
            <p className="text-[11px] text-muted-foreground" dir="rtl">
              سمعت: <span dir="auto">{result.heard}</span>
            </p>
          )}
        </div>
      )}
    </div>
  );
}



function ChatPage() {
  const loadMsgs = useServerFn(getChatMessages);
  const sendMsg = useServerFn(sendChatMessage);
  const clearMsgs = useServerFn(clearChat);
  const transcribe = useServerFn(transcribeAudio);
  const runProgress = useServerFn(getProgress);
  const runAssess = useServerFn(assessConversation);

  const [lang] = useAppLang();
  const [studentProfile] = useStudentProfile();
  const langMeta = langByCode(lang);
  const langName = langMeta?.name ?? "English";
  const langNameAr = langMeta?.nameAr ?? lang;
  const bcp47 = langMeta?.bcp47 ?? "en-US";

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [extras, setExtras] = useState<Record<string, Extra>>({});
  const [showTr, setShowTr] = useState<Record<string, boolean>>({});
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const [recording, setRecording] = useState(false);
  const [liveText, setLiveText] = useState("");
  const stopLiveRef = useRef<() => void>(() => {});
  const [transcribing, setTranscribing] = useState(false);

  const [autoSpeak, setAutoSpeak] = useState(true);
  const [level, setLevel] = useState("A1");
  const [xp, setXp] = useState(0);
  const [userGender] = useUserGender();
  const gender: VoiceGender = userGender === "male" ? "female" : "male";
  const [error, setError] = useState<string | null>(null);
  const [scenario, setScenario] = usePersistedState<string>("chat_scenario", "free");
  const pronScores = useRef<number[]>([]);
  const [score, setScore] = useState<ConversationScore | null>(null);
  const [scoring, setScoring] = useState(false);
  const [liveMode, setLiveMode] = useState(false);
  const liveRef = useRef(false);
  const startRecRef = useRef<() => void>(() => {});
  liveRef.current = liveMode;



  const addPronScore = (acc: number) => {
    pronScores.current.push(acc);
  };

  const finishAndScore = async () => {
    if (scoring) return;
    setScoring(true);
    setError(null);
    try {
      const avg =
        pronScores.current.length > 0
          ? pronScores.current.reduce((a, b) => a + b, 0) / pronScores.current.length
          : undefined;
      const r = await runAssess({
        data: { targetLang: lang, targetLangName: langName, pronunciationScore: avg },
      });
      setScore(r);
      setLevel(r.level);
    } catch (e: any) {
      const msg = e?.message?.includes("RATE_LIMIT")
        ? "تم تجاوز حد الطلبات، حاول بعد قليل."
        : e?.message?.includes("CREDITS")
          ? "نفد الرصيد. يرجى ترقية الخطة لإضافة رصيد."
          : "تعذّر إنشاء التقييم.";
      setError(msg);
    } finally {
      setScoring(false);
    }
  };


  const mediaRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    loadMsgs()
      .then((m) => setMessages(m))
      .catch(() => {})
      .finally(() => setLoading(false));
    runProgress({ data: { targetLang: lang } })
      .then((p: any) => {
        setLevel(p?.level ?? "A1");
        setXp(p?.xp ?? 0);
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lang]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, sending]);

  useEffect(() => {
    inputRef.current?.focus();
  }, [loading, sending]);

  const send = async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || sending) return;
    stopSpeaking(); // مقاطعة: أوقف صوت المدرّس فوراً عند إرسال الطالب
    setError(null);
    setInput("");
    const optimistic: ChatMessage = {
      id: `tmp-${Date.now()}`,
      role: "user",
      content: trimmed,
      created_at: new Date().toISOString(),
    };
    setMessages((m) => [...m, optimistic]);
    setSending(true);
    try {
      const r = await sendMsg({
        data: {
          text: trimmed,
          targetLang: lang,
          targetLangName: langName,
          scenario: scenarioById(scenario)?.prompt,
          student: buildStudentContext(studentProfile) || undefined,
        },
      });
      const id = `a-${Date.now()}`;
      setMessages((m) => [...m, { id, role: "assistant", content: r.reply, created_at: new Date().toISOString() }]);
      setExtras((e) => ({ ...e, [id]: { translation: r.translation, correction: r.correction, xpGain: r.xp } }));
      setLevel(r.level);
      setXp((v) => v + r.xp);
      if (autoSpeak || liveRef.current) {
        speak(r.reply, bcp47, gender, () => {
          // وضع المحادثة المباشرة: افتح الميكروفون تلقائياً بعد انتهاء المدرّس
          if (liveRef.current) setTimeout(() => startRecRef.current(), 250);
        });
      }
    } catch (e: any) {
      const msg = e?.message?.includes("RATE_LIMIT")
        ? "تم تجاوز حد الطلبات، حاول بعد قليل."
        : e?.message?.includes("CREDITS")
          ? "نفد الرصيد. يرجى ترقية الخطة لإضافة رصيد."
          : "حدث خطأ أثناء الإرسال.";
      setError(msg);
    } finally {
      setSending(false);
    }
  };

  // ============ الوضع الصوتي: بثّ منخفض التأخير ============
  const streamerRef = useRef<ReturnType<typeof createSpeechStreamer> | null>(null);
  const stopBargeRef = useRef<() => void>(() => {});

  const stopAiAudio = () => {
    streamerRef.current?.cancel();
    streamerRef.current = null;
    stopBargeRef.current();
    stopBargeRef.current = () => {};
    stopSpeaking();
  };

  const sendVoiceStreaming = async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || sending) return;
    stopAiAudio();
    setError(null);
    setInput("");
    setMessages((m) => [
      ...m,
      { id: `tmp-${Date.now()}`, role: "user", content: trimmed, created_at: new Date().toISOString() },
    ]);
    setSending(true);
    const id = `a-${Date.now()}`;
    let acc = "";
    try {
      const { data: sess } = await supabase.auth.getSession();
      const token = sess.session?.access_token;
      if (!token) throw new Error("AUTH");
      const res = await fetch("/api/voice-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          text: trimmed,
          targetLang: lang,
          targetLangName: langName,
          scenario: scenarioById(scenario)?.prompt,
          student: buildStudentContext(studentProfile) || undefined,
        }),
      });
      if (res.status === 429) throw new Error("RATE_LIMIT");
      if (res.status === 402) throw new Error("CREDITS");
      if (!res.ok || !res.body) throw new Error("AI");

      // ابدأ نطق الصوت فور وصول أول جملة بدون انتظار الردّ الكامل
      const streamer = createSpeechStreamer(bcp47, gender, () => {
        streamerRef.current = null;
        stopBargeRef.current();
        stopBargeRef.current = () => {};
        if (liveRef.current) setTimeout(() => startRecRef.current(), 200);
      });
      streamerRef.current = streamer;
      // مقاطعة تلقائية: أوقف صوت المدرّس لحظة بدء الطالب بالكلام
      void startBargeInDetector(() => {
        if (!liveRef.current) return;
        stopAiAudio();
        startRecRef.current();
      }).then((stop) => {
        if (streamerRef.current === streamer) stopBargeRef.current = stop;
        else stop();
      });

      setMessages((m) => [...m, { id, role: "assistant", content: "", created_at: new Date().toISOString() }]);
      setSending(false);

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
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
              acc += delta;
              streamer.push(delta);
              setMessages((m) => m.map((x) => (x.id === id ? { ...x, content: acc } : x)));
            }
          } catch {
            /* تجاهل الأجزاء غير المكتملة */
          }
        }
      }
      streamer.end();
    } catch (e: any) {
      const msg = e?.message?.includes("RATE_LIMIT")
        ? "تم تجاوز حد الطلبات، حاول بعد قليل."
        : e?.message?.includes("CREDITS")
          ? "نفد الرصيد. يرجى ترقية الخطة لإضافة رصيد."
          : "حدث خطأ أثناء المحادثة الصوتية.";
      setError(msg);
      stopAiAudio();
    } finally {
      setSending(false);
    }
  };

  const startRecording = async () => {
    stopAiAudio(); // مقاطعة: توقّف عن الكلام بمجرد أن يبدأ الطالب بالتحدّث
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mime = MediaRecorder.isTypeSupported("audio/webm")
        ? "audio/webm"
        : MediaRecorder.isTypeSupported("audio/mp4")
          ? "audio/mp4"
          : "";
      const rec = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream);
      chunksRef.current = [];
      rec.ondataavailable = (ev) => {
        if (ev.data.size > 0) chunksRef.current.push(ev.data);
      };
      rec.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        stopLiveRef.current();
        const blob = new Blob(chunksRef.current, { type: rec.mimeType || "audio/webm" });
        if (blob.size < 1200) {
          setError("التسجيل قصير جداً، حاول مجدداً.");
          setLiveText("");
          return;
        }
        setTranscribing(true);
        try {
          const dataUrl = await blobToDataUrl(blob);
          const { text } = await transcribe({ data: { audio: dataUrl, mime: rec.mimeType, lang } });
          if (text) await (liveRef.current ? sendVoiceStreaming(text) : send(text));
          else setError("لم أتمكّن من فهم الصوت، حاول مجدداً.");
        } catch {
          setError("تعذّر تحويل الصوت إلى نص.");
        } finally {
          setTranscribing(false);
          setLiveText("");
        }
      };
      mediaRef.current = rec;
      rec.start();
      setRecording(true);
      // عرض لحظي للنص أثناء التحدّث
      setLiveText("");
      stopLiveRef.current = startLiveTranscript(bcp47, (t) => setLiveText(t));
    } catch {
      setError("يرجى السماح بالوصول إلى الميكروفون.");
      setLiveMode(false);
    }
  };
  startRecRef.current = startRecording;

  const stopRecording = () => {
    stopLiveRef.current();
    mediaRef.current?.stop();
    setRecording(false);
  };


  const toggleLive = () => {
    if (liveMode) {
      liveRef.current = false;
      setLiveMode(false);
      stopAiAudio();
      if (recording) stopRecording();
      return;
    }
    liveRef.current = true;
    setLiveMode(true);
    stopSpeaking();
    // تحية افتتاحية قصيرة بلغة الهدف ثم يفتح الميكروفون تلقائياً
    void sendVoiceStreaming(
      `${LIVE_MARK} ابدأ الآن محادثة صوتية يومية: حيّني بتحية قصيرة جداً بلغة ${langName} واسألني سؤالاً بسيطاً واحداً. لا تشرح أي قواعد إلا إذا طلبت ذلك.`,
    );
  };

  const handleClear = async () => {
    await clearMsgs().catch(() => {});
    setMessages([]);
    setExtras({});
    stopSpeaking();
  };

  const visibleMessages = messages.filter((m) => !m.content.startsWith(LIVE_MARK));


  return (
    <div className="flex h-[calc(100vh-9rem)] flex-col">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <div className="flex size-10 items-center justify-center rounded-2xl gradient-primary text-primary-foreground shadow-lg">
            <GraduationCap className="size-5" />
          </div>
          <div>
            <h1 className="text-lg font-bold leading-tight">مدرّس {langNameAr} الذكي</h1>
            <p className="flex items-center gap-2 text-xs text-muted-foreground">
              <span className="rounded-full bg-primary/10 px-2 py-0.5 font-semibold text-primary">{level}</span>
              <span className="flex items-center gap-0.5"><Sparkles className="size-3" /> {xp} XP</span>
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant={liveMode ? "default" : "ghost"}
            size="icon"
            className={`rounded-xl ${liveMode ? "gradient-primary text-primary-foreground animate-pulse" : ""}`}
            title={liveMode ? "إيقاف المحادثة الصوتية المباشرة" : "بدء محادثة صوتية مباشرة"}
            onClick={toggleLive}
            disabled={sending || transcribing}
          >
            <Radio className="size-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="rounded-xl"
            title="إنهاء المحادثة والحصول على تقييم"
            onClick={finishAndScore}
            disabled={scoring || messages.length === 0}
          >
            {scoring ? <Loader2 className="size-4 animate-spin" /> : <Award className="size-4" />}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="rounded-xl"
            title={autoSpeak ? "إيقاف النطق التلقائي" : "تشغيل النطق التلقائي"}
            onClick={() => {
              setAutoSpeak((v) => !v);
              stopSpeaking();
            }}
          >
            {autoSpeak ? <Volume2 className="size-4" /> : <VolumeX className="size-4" />}
          </Button>
          <Button variant="ghost" size="icon" className="rounded-xl" title="مسح المحادثة" onClick={handleClear}>
            <Trash2 className="size-4" />
          </Button>
        </div>
      </div>

      {/* اختيار سيناريو المحادثة */}
      <div className="mb-3 flex gap-1.5 overflow-x-auto pb-1">
        {SCENARIOS.map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => setScenario(s.id)}
            title={s.descAr}
            className={`shrink-0 rounded-full border px-3 py-1.5 text-xs font-medium transition ${
              scenario === s.id
                ? "gradient-primary text-primary-foreground border-transparent"
                : "bg-card hover:border-primary hover:text-primary"
            }`}
          >
            {s.emoji} {s.titleAr}
          </button>
        ))}
      </div>


      <div className="flex-1 space-y-3 overflow-y-auto rounded-2xl border bg-card/50 p-4">
        {loading ? (
          <div className="flex h-full items-center justify-center">
            <Loader2 className="size-7 animate-spin text-primary" />
          </div>
        ) : visibleMessages.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-center text-muted-foreground">
            <div className="flex size-14 items-center justify-center rounded-3xl gradient-primary text-primary-foreground">
              <GraduationCap className="size-7" />
            </div>
            <p className="font-medium text-foreground">مرحباً! أنا مدرّسك لتعلّم {langNameAr}.</p>
            <p className="text-sm">تحدّث معي بالصوت أو بالكتابة، وسأصحّح أخطاءك وأطوّر مستواك خطوة بخطوة.</p>
            <div className="mt-2 flex flex-wrap justify-center gap-2">
              {["ابدأ محادثة بسيطة معي", "علّمني كلمات جديدة", "صحّح لي هذه الجملة"].map((s) => (
                <button
                  key={s}
                  onClick={() => send(s)}
                  className="rounded-full border bg-card px-3 py-1.5 text-xs hover:border-primary hover:text-primary"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : (
          visibleMessages.map((m) => {
            const ex = extras[m.id];
            return (
              <div key={m.id} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                <div className="max-w-[88%] space-y-2">
                  <div
                    className={`rounded-2xl px-4 py-2.5 ${
                      m.role === "user" ? "gradient-primary text-primary-foreground" : "border bg-card"
                    }`}
                  >
                    {m.role === "assistant" ? (
                      <div className="prose prose-sm max-w-none dark:prose-invert" dir="auto">
                        <ReactMarkdown>{m.content}</ReactMarkdown>
                      </div>
                    ) : (
                      <span dir="auto" className="whitespace-pre-wrap">
                        {m.content}
                      </span>
                    )}
                    {m.role === "assistant" && (
                      <div className="mt-1.5 flex items-center gap-3">
                        <button
                          onClick={() => speak(m.content, bcp47, gender)}
                          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-primary"
                        >
                          <Volume2 className="size-3.5" /> استمع
                        </button>
                        {ex?.translation && (
                          <button
                            onClick={() => setShowTr((s) => ({ ...s, [m.id]: !s[m.id] }))}
                            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-primary"
                          >
                            <Languages className="size-3.5" /> {showTr[m.id] ? "إخفاء الترجمة" : "الترجمة"}
                          </button>
                        )}
                      </div>
                    )}
                  </div>

                  {m.role === "assistant" && showTr[m.id] && ex?.translation && (
                    <div className="rounded-xl border border-dashed bg-muted/40 px-3 py-2 text-sm text-muted-foreground" dir="rtl">
                      {ex.translation}
                    </div>
                  )}

                  {m.role === "assistant" && ex?.correction && (
                    <div className="space-y-2 rounded-xl border border-amber-500/40 bg-amber-500/10 px-3 py-2.5 text-sm" dir="auto">
                      <p className="flex items-center gap-1 font-semibold text-amber-600 dark:text-amber-400">
                        <CheckCircle2 className="size-4" /> طبقة التصحيح
                      </p>

                      {ex.correction.original && (
                        <div dir="rtl" className="text-xs text-muted-foreground">
                          <span className="font-semibold text-destructive">الخطأ: </span>
                          <span dir="auto" className="line-through">{ex.correction.original}</span>
                        </div>
                      )}

                      <div dir="rtl" className="text-xs text-muted-foreground">
                        <span className="font-semibold text-emerald-600 dark:text-emerald-400">الصواب: </span>
                        <button
                          type="button"
                          dir="auto"
                          onClick={() => speak(ex.correction!.corrected, bcp47, gender)}
                          className="font-medium text-foreground hover:text-primary"
                        >
                          {ex.correction.corrected} 🔊
                        </button>
                      </div>

                      <PronunciationPractice
                        target={ex.correction.corrected}
                        bcp47={bcp47}
                        gender={gender}
                        lang={lang}
                        transcribe={transcribe}
                        onScore={addPronScore}
                      />



                      {ex.correction.reason && (
                        <p className="rounded-lg bg-background/60 px-2 py-1.5 text-xs" dir="rtl">
                          <span className="font-semibold">السبب: </span>
                          {ex.correction.reason}
                        </p>
                      )}

                      {ex.correction.rule && (
                        <p className="rounded-lg border border-dashed bg-background/60 px-2 py-1.5 text-xs" dir="rtl">
                          <span className="font-semibold text-primary">القاعدة: </span>
                          {ex.correction.rule}
                        </p>
                      )}

                      {ex.correction.examples && ex.correction.examples.length > 0 && (
                        <div className="space-y-1">
                          <p className="text-xs font-semibold text-muted-foreground" dir="rtl">
                            أمثلة بديلة (اضغط للاستخدام):
                          </p>
                          <div className="flex flex-wrap gap-1.5">
                            {ex.correction.examples.map((sample, si) => (
                              <button
                                key={si}
                                type="button"
                                dir="auto"
                                onClick={() => {
                                  setInput(sample);
                                  speak(sample, bcp47, gender);
                                  inputRef.current?.focus();
                                }}
                                className="rounded-full border bg-background px-3 py-1 text-xs hover:border-primary hover:text-primary"
                              >
                                {sample}
                              </button>
                            ))}
                          </div>
                        </div>
                      )}

                      {ex.correction.explanation && (
                        <p className="text-xs text-muted-foreground" dir="rtl">
                          {ex.correction.explanation}
                        </p>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })
        )}
        {recording && (
          <div className="flex justify-end">
            <div className="max-w-[85%] rounded-2xl border border-dashed border-primary/50 bg-primary/5 px-4 py-2.5 text-sm">
              <div className="mb-1 flex items-center gap-2 text-xs text-primary">
                <span className="inline-block size-2 animate-pulse rounded-full bg-destructive" />
                جارٍ الاستماع...
              </div>
              <p dir="auto" className="whitespace-pre-wrap text-foreground/90">
                {liveText || "تحدّث الآن وسيظهر كلامك هنا لحظياً..."}
              </p>
            </div>
          </div>
        )}
        {(sending || transcribing) && (

          <div className="flex justify-start">
            <div className="flex items-center gap-2 rounded-2xl border bg-card px-4 py-2.5 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
              {transcribing ? "جارٍ تحويل الصوت..." : "يفكّر المدرّس..."}
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {error && <p className="mt-2 text-sm text-destructive">{error}</p>}

      <form
        className="mt-3 flex items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          send(input);
        }}
      >
        <Button
          type="button"
          variant={recording ? "destructive" : "secondary"}
          size="icon"
          className="shrink-0 rounded-xl"
          onClick={recording ? stopRecording : startRecording}
          disabled={transcribing || sending}
          title="تحدّث بالصوت"
        >
          {recording ? <Square className="size-4" /> : <Mic className="size-4" />}
        </Button>
        <textarea
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send(input);
            }
          }}
          rows={1}
          placeholder={recording ? "جارٍ التسجيل... اضغط للإيقاف" : "اكتب أو تحدّث بالصوت..."}
          dir="auto"
          className="max-h-32 flex-1 resize-none rounded-xl border bg-card px-4 py-2.5 outline-none focus:ring-2 focus:ring-primary"
        />
        <Button
          type="submit"
          size="icon"
          className="shrink-0 rounded-xl gradient-primary text-primary-foreground"
          disabled={sending || !input.trim()}
        >
          <Send className="size-4" />
        </Button>
      </form>

      {score && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={() => setScore(null)}
        >
          <div
            className="max-h-[85vh] w-full max-w-md overflow-y-auto rounded-3xl border bg-card p-5 shadow-xl"
            dir="rtl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-center justify-between">
              <h2 className="flex items-center gap-2 text-lg font-bold">
                <Award className="size-5 text-primary" /> تقييم المحادثة
              </h2>
              <button onClick={() => setScore(null)} className="rounded-lg p-1 hover:bg-muted">
                <X className="size-5" />
              </button>
            </div>

            <div className="mb-4 flex flex-col items-center">
              <div className="flex size-24 flex-col items-center justify-center rounded-full gradient-primary text-primary-foreground">
                <span className="text-3xl font-extrabold">{score.overall}</span>
                <span className="text-xs">من 100</span>
              </div>
              <span className="mt-2 rounded-full bg-primary/10 px-3 py-0.5 text-sm font-semibold text-primary">
                المستوى: {score.level}
              </span>
            </div>

            <div className="space-y-2">
              {[
                { label: "النطق", value: score.pronunciation },
                { label: "القواعد", value: score.grammar },
                { label: "المفردات", value: score.vocabulary },
                { label: "الطلاقة", value: score.fluency },
              ].map((row) => (
                <div key={row.label}>
                  <div className="mb-0.5 flex justify-between text-xs font-medium">
                    <span>{row.label}</span>
                    <span>{row.value}%</span>
                  </div>
                  <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                    <div className="h-full gradient-primary transition-all" style={{ width: `${row.value}%` }} />
                  </div>
                </div>
              ))}
            </div>

            {score.feedback && (
              <p className="mt-4 rounded-xl bg-muted/60 px-3 py-2 text-sm">{score.feedback}</p>
            )}

            {score.strengths.length > 0 && (
              <div className="mt-3">
                <p className="mb-1 text-sm font-semibold text-emerald-600 dark:text-emerald-400">نقاط القوة</p>
                <ul className="list-inside list-disc space-y-0.5 text-sm text-muted-foreground">
                  {score.strengths.map((s, i) => (
                    <li key={i}>{s}</li>
                  ))}
                </ul>
              </div>
            )}

            {score.improvements.length > 0 && (
              <div className="mt-3">
                <p className="mb-1 text-sm font-semibold text-amber-600 dark:text-amber-400">للتحسين</p>
                <ul className="list-inside list-disc space-y-0.5 text-sm text-muted-foreground">
                  {score.improvements.map((s, i) => (
                    <li key={i}>{s}</li>
                  ))}
                </ul>
              </div>
            )}

            <Button className="mt-5 w-full rounded-xl gradient-primary text-primary-foreground" onClick={() => setScore(null)}>
              متابعة المحادثة
            </Button>
          </div>
        </div>
      )}
    </div>

  );
}
