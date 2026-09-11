import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import { useServerFn } from "@tanstack/react-start";
import { askAssistant, type AssistantMessage } from "@/lib/assistant.functions";
import { transcribeAudio } from "@/lib/chat.functions";
import { speak, stopSpeaking, type VoiceGender } from "@/lib/speech";
import { useUserGender, useNativeLang } from "@/lib/prefs";
import { langByCode } from "@/lib/languages";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Send, Mic, Square, Volume2, Loader2, Trash2, Bot, Sparkles } from "lucide-react";

export const Route = createFileRoute("/_authenticated/assistant")({
  head: () => ({ meta: [{ title: "المحادثة الحرة — ترجملي" }] }),
  component: AssistantPage,
});

type UiMessage = AssistantMessage & { id: string };

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = reject;
    r.readAsDataURL(blob);
  });
}

const SUGGESTIONS = [
  "اشرح لي فكرة بسيطة عن الذكاء الاصطناعي",
  "Traduci questa frase in italiano",
  "Help me practice English conversation",
  "ساعدني في تنظيم جدول مذاكرة",
];

function AssistantPage() {
  const ask = useServerFn(askAssistant);
  const transcribe = useServerFn(transcribeAudio);
  const [gender] = useUserGender();
  const [nativeLang] = useNativeLang();
  const voiceGender: VoiceGender = gender === "male" ? "female" : "male";
  const bcp47 = langByCode(nativeLang)?.bcp47 ?? "ar-SA";

  const [messages, setMessages] = useState<UiMessage[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [recording, setRecording] = useState(false);
  const [transcribing, setTranscribing] = useState(false);

  const recRef = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, busy]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => () => stopSpeaking(), []);

  const aiError = (err: any) => {
    const msg = String(err?.message ?? "");
    if (msg.includes("RATE_LIMIT")) toast.error("تم تجاوز حد الطلبات، حاول بعد قليل.");
    else if (msg.includes("CREDITS")) toast.error("نفد رصيد الذكاء الاصطناعي. يرجى إضافة رصيد.");
    else toast.error("تعذّرت الاستجابة، حاول مجدداً.");
  };

  const send = async (raw?: string) => {
    const text = (raw ?? input).trim();
    if (!text || busy) return;
    const userMsg: UiMessage = { id: crypto.randomUUID(), role: "user", content: text };
    const next = [...messages, userMsg];
    setMessages(next);
    setInput("");
    setBusy(true);
    try {
      const payload = next.map(({ role, content }) => ({ role, content }));
      const { reply } = await ask({ data: { messages: payload } });
      setMessages((p) => [...p, { id: crypto.randomUUID(), role: "assistant", content: reply }]);
    } catch (err) {
      aiError(err);
      setMessages((p) => p.filter((m) => m.id !== userMsg.id));
      setInput(text);
    } finally {
      setBusy(false);
      inputRef.current?.focus();
    }
  };

  const startRec = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream);
      chunks.current = [];
      mr.ondataavailable = (e) => e.data.size > 0 && chunks.current.push(e.data);
      mr.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunks.current, { type: mr.mimeType || "audio/webm" });
        setTranscribing(true);
        try {
          const dataUrl = await blobToDataUrl(blob);
          const { text } = await transcribe({
            data: { audio: dataUrl, mime: blob.type, lang: nativeLang },
          });
          if (text) await send(text);
          else toast.error("لم يُلتقط أي كلام.");
        } catch (err) {
          aiError(err);
        } finally {
          setTranscribing(false);
        }
      };
      recRef.current = mr;
      mr.start();
      setRecording(true);
    } catch {
      toast.error("تعذّر الوصول إلى الميكروفون.");
    }
  };

  const stopRec = () => {
    recRef.current?.stop();
    setRecording(false);
  };

  const clearAll = () => {
    stopSpeaking();
    setMessages([]);
  };

  return (
    <div className="flex h-[calc(100vh-8.5rem)] flex-col">
      <div className="flex items-center justify-between pb-3">
        <div className="flex items-center gap-2">
          <span className="flex size-9 items-center justify-center rounded-xl gradient-primary text-primary-foreground shadow-glow">
            <Bot className="size-5" />
          </span>
          <div>
            <h1 className="text-lg font-bold leading-tight">المحادثة الحرة</h1>
            <p className="text-xs text-muted-foreground">تحدّث أو اكتب بأي موضوع</p>
          </div>
        </div>
        {messages.length > 0 && (
          <Button
            variant="ghost"
            size="icon"
            className="rounded-xl"
            onClick={clearAll}
            title="محادثة جديدة"
          >
            <Trash2 className="size-4" />
          </Button>
        )}
      </div>

      <div
        ref={scrollRef}
        className="flex-1 space-y-4 overflow-y-auto rounded-2xl border bg-card/40 p-4"
      >
        {messages.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-4 text-center">
            <span className="flex size-16 items-center justify-center rounded-2xl gradient-primary text-primary-foreground shadow-glow">
              <Sparkles className="size-8" />
            </span>
            <div>
              <p className="font-semibold">كيف يمكنني مساعدتك اليوم؟</p>
              <p className="mt-1 text-sm text-muted-foreground">
                اسأل، ترجم، تعلّم — بالعربية أو الإيطالية أو الإنجليزية.
              </p>
            </div>
            <div className="grid w-full max-w-md gap-2 sm:grid-cols-2">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  onClick={() => send(s)}
                  className="rounded-xl border bg-background px-3 py-2 text-right text-sm transition-colors hover:bg-accent"
                  dir="auto"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : (
          messages.map((m) => (
            <div
              key={m.id}
              className={`flex ${m.role === "user" ? "justify-start" : "justify-end"}`}
            >
              <div
                className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
                  m.role === "user"
                    ? "gradient-primary text-primary-foreground shadow-glow"
                    : "border bg-background"
                }`}
                dir="auto"
              >
                {m.role === "assistant" ? (
                  <>
                    <div className="prose prose-sm max-w-none dark:prose-invert prose-p:my-1.5 prose-headings:my-2 prose-ul:my-1.5 prose-pre:my-2">
                      <ReactMarkdown>{m.content}</ReactMarkdown>
                    </div>
                    <button
                      onClick={() => speak(m.content, bcp47, voiceGender)}
                      className="mt-1.5 text-muted-foreground transition-colors hover:text-foreground"
                      title="استمع"
                    >
                      <Volume2 className="size-4" />
                    </button>
                  </>
                ) : (
                  <span className="whitespace-pre-wrap">{m.content}</span>
                )}
              </div>
            </div>
          ))
        )}
        {(busy || transcribing) && (
          <div className="flex justify-end">
            <div className="flex items-center gap-2 rounded-2xl border bg-background px-4 py-2.5 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
              {transcribing ? "جارٍ تحويل الصوت..." : "يكتب..."}
            </div>
          </div>
        )}
      </div>

      <div className="mt-3 flex items-end gap-2">
        <Button
          type="button"
          size="icon"
          variant={recording ? "destructive" : "secondary"}
          className="size-11 shrink-0 rounded-xl"
          onClick={recording ? stopRec : startRec}
          disabled={busy || transcribing}
          title={recording ? "إيقاف التسجيل" : "تحدّث"}
        >
          {recording ? <Square className="size-5" /> : <Mic className="size-5" />}
        </Button>
        <Textarea
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send();
            }
          }}
          placeholder="اكتب رسالتك..."
          className="max-h-32 min-h-11 flex-1 resize-none rounded-xl py-2.5"
          dir="auto"
        />
        <Button
          size="icon"
          className="size-11 shrink-0 rounded-xl gradient-primary text-primary-foreground shadow-glow"
          onClick={() => send()}
          disabled={busy || transcribing || !input.trim()}
          title="إرسال"
        >
          {busy ? <Loader2 className="size-5 animate-spin" /> : <Send className="size-5" />}
        </Button>
      </div>
    </div>
  );
}
