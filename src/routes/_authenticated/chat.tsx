import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import { useServerFn } from "@tanstack/react-start";
import { getChatMessages, sendChatMessage, clearChat, type ChatMessage } from "@/lib/chat.functions";
import { speak, stopSpeaking, getSpeechRecognition, isSpeechRecognitionSupported, type VoiceGender } from "@/lib/speech";
import { useUserGender } from "@/lib/prefs";
import { Button } from "@/components/ui/button";
import { Bot, Send, Mic, MicOff, Volume2, VolumeX, Trash2, Loader2 } from "lucide-react";

export const Route = createFileRoute("/_authenticated/chat")({
  head: () => ({ meta: [{ title: "المساعد الذكي — ترجملي" }] }),
  component: ChatPage,
});

function detectBcp47(text: string) {
  return /[\u0600-\u06FF]/.test(text) ? "ar-SA" : "en-US";
}

function ChatPage() {
  const loadMsgs = useServerFn(getChatMessages);
  const sendMsg = useServerFn(sendChatMessage);
  const clearMsgs = useServerFn(clearChat);

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const [listening, setListening] = useState(false);
  const [autoSpeak, setAutoSpeak] = useState(true);
  const [gender, setGender] = useState<VoiceGender>("female");
  const [error, setError] = useState<string | null>(null);

  const recRef = useRef<any>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    loadMsgs()
      .then((m) => setMessages(m))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, sending]);

  useEffect(() => {
    inputRef.current?.focus();
  }, [loading, sending]);

  const send = async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || sending) return;
    setError(null);
    setInput("");
    const optimistic: ChatMessage = { id: `tmp-${Date.now()}`, role: "user", content: trimmed, created_at: new Date().toISOString() };
    setMessages((m) => [...m, optimistic]);
    setSending(true);
    try {
      const { reply } = await sendMsg({ data: { text: trimmed } });
      setMessages((m) => [...m, { id: `a-${Date.now()}`, role: "assistant", content: reply, created_at: new Date().toISOString() }]);
      if (autoSpeak) speak(reply, detectBcp47(reply), gender);
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

  const toggleListen = () => {
    const SR = getSpeechRecognition();
    if (!SR) return;
    if (listening) {
      recRef.current?.stop();
      setListening(false);
      return;
    }
    const rec = new SR();
    rec.lang = /[\u0600-\u06FF]/.test(input) ? "ar-SA" : "ar-SA";
    rec.interimResults = false;
    rec.onresult = (ev: any) => {
      const t = ev.results[0][0].transcript;
      setInput((cur) => (cur ? cur + " " : "") + t);
    };
    rec.onend = () => setListening(false);
    rec.onerror = () => setListening(false);
    recRef.current = rec;
    rec.start();
    setListening(true);
  };

  const handleClear = async () => {
    await clearMsgs().catch(() => {});
    setMessages([]);
    stopSpeaking();
  };

  return (
    <div className="flex h-[calc(100vh-9rem)] flex-col">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Bot className="size-6 text-primary" />
          <h1 className="text-2xl font-bold">المساعد الذكي</h1>
        </div>
        <div className="flex items-center gap-1">
          <div className="flex items-center gap-1 rounded-xl bg-muted p-1 text-xs">
            <button onClick={() => setGender("female")} className={`rounded-lg px-2 py-1 ${gender === "female" ? "bg-card shadow-sm" : "text-muted-foreground"}`}>مؤنث</button>
            <button onClick={() => setGender("male")} className={`rounded-lg px-2 py-1 ${gender === "male" ? "bg-card shadow-sm" : "text-muted-foreground"}`}>مذكر</button>
          </div>
          <Button variant="ghost" size="icon" className="rounded-xl" title={autoSpeak ? "إيقاف النطق التلقائي" : "تشغيل النطق التلقائي"} onClick={() => { setAutoSpeak((v) => !v); stopSpeaking(); }}>
            {autoSpeak ? <Volume2 className="size-4" /> : <VolumeX className="size-4" />}
          </Button>
          <Button variant="ghost" size="icon" className="rounded-xl" title="مسح المحادثة" onClick={handleClear}>
            <Trash2 className="size-4" />
          </Button>
        </div>
      </div>

      <div className="flex-1 space-y-3 overflow-y-auto rounded-2xl border bg-card/50 p-4">
        {loading ? (
          <div className="flex h-full items-center justify-center"><Loader2 className="size-7 animate-spin text-primary" /></div>
        ) : messages.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-center text-muted-foreground">
            <Bot className="size-10 text-primary/60" />
            <p>مرحباً! أنا مساعدك للغات والمحادثة.</p>
            <p className="text-sm">جرّب: "صحّح لي: I goes to school" أو "درّبني على الإنجليزية".</p>
          </div>
        ) : (
          messages.map((m) => (
            <div key={m.id} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
              <div className={`max-w-[85%] rounded-2xl px-4 py-2.5 ${m.role === "user" ? "gradient-primary text-primary-foreground" : "border bg-card"}`}>
                {m.role === "assistant" ? (
                  <div className="prose prose-sm max-w-none dark:prose-invert" dir="auto">
                    <ReactMarkdown>{m.content}</ReactMarkdown>
                  </div>
                ) : (
                  <span dir="auto" className="whitespace-pre-wrap">{m.content}</span>
                )}
                {m.role === "assistant" && (
                  <button onClick={() => speak(m.content, detectBcp47(m.content), gender)} className="mt-1 flex items-center gap-1 text-xs text-muted-foreground hover:text-primary">
                    <Volume2 className="size-3.5" /> استمع
                  </button>
                )}
              </div>
            </div>
          ))
        )}
        {sending && (
          <div className="flex justify-start">
            <div className="rounded-2xl border bg-card px-4 py-2.5 text-muted-foreground"><Loader2 className="size-4 animate-spin" /></div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {error && <p className="mt-2 text-sm text-destructive">{error}</p>}

      <form
        className="mt-3 flex items-end gap-2"
        onSubmit={(e) => { e.preventDefault(); send(input); }}
      >
        {isSpeechRecognitionSupported() && (
          <Button type="button" variant={listening ? "default" : "secondary"} size="icon" className="rounded-xl shrink-0" onClick={toggleListen} title="إدخال صوتي">
            {listening ? <MicOff className="size-4" /> : <Mic className="size-4" />}
          </Button>
        )}
        <textarea
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(input); } }}
          rows={1}
          placeholder="اكتب رسالتك..."
          dir="auto"
          className="max-h-32 flex-1 resize-none rounded-xl border bg-card px-4 py-2.5 outline-none focus:ring-2 focus:ring-primary"
        />
        <Button type="submit" size="icon" className="rounded-xl shrink-0 gradient-primary text-primary-foreground" disabled={sending || !input.trim()}>
          <Send className="size-4" />
        </Button>
      </form>
    </div>
  );
}
