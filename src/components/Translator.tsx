import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import { translateText } from "@/lib/translate.functions";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { LANGUAGES, langByCode } from "@/lib/languages";
import { speak, stopSpeaking, getSpeechRecognition, isSpeechRecognitionSupported, type VoiceGender } from "@/lib/speech";
import { useUserGender, useAppLang } from "@/lib/prefs";
import { ImageTranslator, type ImgResult } from "@/components/ImageTranslator";
import type { Conjugation } from "@/lib/translate.functions";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { toast } from "sonner";
import {
  Languages as LangIcon, Mic, Camera, Volume2, Copy, Star, Loader2,
  Square, Sparkles, MessageCircle, Settings,
} from "lucide-react";

type Result = { detectedLang: string; translation: string; sourceText: string; conjugations?: Conjugation[] };

export function Translator() {
  const { user } = useAuth();
  const doText = useServerFn(translateText);

  const [targetLang] = useAppLang();
  const [text, setText] = useState("");
  const [result, setResult] = useState<Result | null>(null);
  const [busy, setBusy] = useState(false);
  const [userGender] = useUserGender();
  // الصوت دائماً عكس جنس المستخدم — يُضبط من الإعدادات
  const gender: VoiceGender = userGender === "male" ? "female" : "male";
  const [listening, setListening] = useState(false);
  const recognitionRef = useRef<any>(null);

  const targetMeta = langByCode(targetLang);

  useEffect(() => () => stopSpeaking(), []);

  const saveHistory = async (r: Result, mode: string) => {
    if (!user) return;
    await supabase.from("translations").insert({
      user_id: user.id,
      source_text: r.sourceText || text,
      translated_text: r.translation,
      source_lang: r.detectedLang,
      target_lang: targetMeta?.nameAr ?? targetLang,
      mode,
    });
  };

  const handleAiError = (err: any) => {
    const msg = String(err?.message ?? "");
    if (msg.includes("RATE_LIMIT")) toast.error("تم تجاوز حد الطلبات، حاول بعد قليل.");
    else if (msg.includes("CREDITS")) toast.error("نفد رصيد الذكاء الاصطناعي. يرجى إضافة رصيد.");
    else toast.error("تعذّرت الترجمة، حاول مجدداً.");
  };

  const runText = async (mode = "text") => {
    if (!text.trim()) return;
    setBusy(true);
    setResult(null);
    try {
      const r = (await doText({ data: { text: text.trim(), targetLang: targetMeta?.name ?? targetLang } })) as Result;
      setResult(r);
      await saveHistory(r, mode);
    } catch (err) {
      handleAiError(err);
    } finally {
      setBusy(false);
    }
  };

  const toggleListen = () => {
    if (!isSpeechRecognitionSupported()) {
      toast.error("الإدخال الصوتي غير مدعوم في هذا المتصفح.");
      return;
    }
    if (listening) {
      recognitionRef.current?.stop();
      return;
    }
    const SR = getSpeechRecognition();
    const rec = new SR();
    rec.lang = "ar-SA";
    rec.continuous = false;
    rec.interimResults = true;
    rec.onresult = (e: any) => {
      const transcript = Array.from(e.results).map((res: any) => res[0].transcript).join("");
      setText(transcript);
    };
    rec.onerror = () => { setListening(false); toast.error("تعذّر التعرف على الصوت."); };
    rec.onend = () => setListening(false);
    recognitionRef.current = rec;
    setListening(true);
    rec.start();
  };

  const handleImageResult = async (r: ImgResult) => {
    setText(r.sourceText);
    setResult(r);
    await saveHistory(r, "image");
  };


  const copy = (t: string) => { navigator.clipboard.writeText(t); toast.success("تم النسخ"); };

  const favorite = async () => {
    if (!result || !user) return;
    await supabase.from("translations").insert({
      user_id: user.id,
      source_text: result.sourceText || text,
      translated_text: result.translation,
      source_lang: result.detectedLang,
      target_lang: targetMeta?.nameAr ?? targetLang,
      mode: "text",
      is_favorite: true,
    });
    toast.success("أُضيفت للمفضلة");
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">الترجمة الذكية</h1>
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">إلى:</span>
          <Select value={targetLang} onValueChange={setTargetLang}>
            <SelectTrigger className="w-40 rounded-xl"><SelectValue /></SelectTrigger>
            <SelectContent>
              {LANGUAGES.map((l) => (
                <SelectItem key={l.code} value={l.code}>{l.nameAr}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <Tabs defaultValue="text" className="w-full">
        <TabsList className="grid w-full grid-cols-4 rounded-xl">
          <TabsTrigger value="text" className="rounded-lg gap-1.5"><LangIcon className="size-4" /> نص</TabsTrigger>
          <TabsTrigger value="voice" className="rounded-lg gap-1.5"><Mic className="size-4" /> صوت</TabsTrigger>
          <TabsTrigger value="speaker" className="rounded-lg gap-1.5"><MessageCircle className="size-4" /> متحدّث</TabsTrigger>
          <TabsTrigger value="image" className="rounded-lg gap-1.5"><Camera className="size-4" /> صورة</TabsTrigger>
        </TabsList>

        <TabsContent value="text" className="mt-4 space-y-3">
          <Textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="اكتب النص المراد ترجمته..."
            className="min-h-32 rounded-2xl text-base"
            maxLength={5000}
          />
          <Button onClick={() => runText("text")} disabled={busy || !text.trim()} className="w-full rounded-xl gradient-primary text-primary-foreground shadow-glow">
            {busy ? <Loader2 className="size-4 animate-spin" /> : <><Sparkles className="size-4" /> ترجم</>}
          </Button>
        </TabsContent>

        <TabsContent value="voice" className="mt-4 space-y-3">
          <div className="flex flex-col items-center gap-3 rounded-2xl border bg-card p-6">
            <button
              onClick={toggleListen}
              className={`flex size-20 items-center justify-center rounded-full text-primary-foreground shadow-glow transition-transform hover:scale-105 ${listening ? "gradient-accent animate-pulse" : "gradient-primary"}`}
            >
              {listening ? <Square className="size-7" /> : <Mic className="size-8" />}
            </button>
            <p className="text-sm text-muted-foreground">
              {listening ? "جارٍ الاستماع... تحدّث الآن" : "اضغط للتحدّث"}
            </p>
          </div>
          {text && <Textarea value={text} onChange={(e) => setText(e.target.value)} className="min-h-20 rounded-2xl" />}
          <Button onClick={() => runText("voice")} disabled={busy || !text.trim()} className="w-full rounded-xl gradient-primary text-primary-foreground shadow-glow">
            {busy ? <Loader2 className="size-4 animate-spin" /> : <><Sparkles className="size-4" /> ترجم الكلام</>}
          </Button>
        </TabsContent>

        <TabsContent value="speaker" className="mt-4">
          <SpeakerMode
            targetLangName={targetMeta?.name ?? targetLang}
            targetBcp47={targetMeta?.bcp47 ?? "en-US"}
            gender={gender}
          />
        </TabsContent>

        <TabsContent value="image" className="mt-4 space-y-3">
          <ImageTranslator
            targetLangName={targetMeta?.name ?? targetLang}
            onResult={handleImageResult}
          />
        </TabsContent>

      </Tabs>

      {result && (
        <div className="space-y-4 rounded-2xl border bg-card p-5 shadow-card">
          <div className="flex items-center justify-between">
            <span className="rounded-full bg-secondary px-3 py-1 text-xs font-medium text-secondary-foreground">
              اللغة المكتشفة: {result.detectedLang || "غير معروفة"}
            </span>
          </div>

          <p className="text-lg font-semibold leading-relaxed">{result.translation}</p>

          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" size="sm" className="rounded-xl gap-1.5" onClick={() => speak(result.translation, targetMeta?.bcp47 ?? "en-US", gender)}>
              <Volume2 className="size-4" /> استمع
            </Button>
            <Button variant="secondary" size="sm" className="rounded-xl gap-1.5" onClick={() => copy(result.translation)}>
              <Copy className="size-4" /> نسخ
            </Button>
            <Button variant="secondary" size="sm" className="rounded-xl gap-1.5" onClick={favorite}>
              <Star className="size-4" /> المفضلة
            </Button>
          </div>

          {result.conjugations && result.conjugations.length > 0 && (
            <div className="space-y-2 rounded-xl border bg-muted/40 p-3">
              <p className="text-sm font-semibold">تصريف الفعل مع أمثلة</p>
              <div className="space-y-1.5">
                {result.conjugations.map((c, i) => (
                  <div key={i} className="flex flex-col gap-0.5 rounded-lg bg-card px-3 py-2 text-sm">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium">{c.pronoun} — {c.form}</span>
                      <button
                        onClick={() => speak(c.example || c.form, targetMeta?.bcp47 ?? "en-US", gender)}
                        className="text-muted-foreground hover:text-foreground"
                        title="استمع"
                      >
                        <Volume2 className="size-4" />
                      </button>
                    </div>
                    {c.example && <span className="text-xs text-muted-foreground">{c.example}</span>}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

type Turn = { source: string; translation: string };

// وضع المتحدّث الحر: استماع مستمر، يترجم كل جملة وينطقها تلقائياً.
function SpeakerMode({
  targetLangName, targetBcp47, gender,
}: { targetLangName: string; targetBcp47: string; gender: VoiceGender }) {
  const doText = useServerFn(translateText);
  const [active, setActive] = useState(false);
  const [interim, setInterim] = useState("");
  const [turns, setTurns] = useState<Turn[]>([]);
  const [srcLang, setSrcLang] = useState("ar-SA");
  const recRef = useRef<any>(null);
  const activeRef = useRef(false);

  useEffect(() => () => { activeRef.current = false; recRef.current?.stop?.(); stopSpeaking(); }, []);

  const handle = async (final: string) => {
    const t = final.trim();
    if (!t) return;
    try {
      const r = (await doText({ data: { text: t, targetLang: targetLangName } })) as Result;
      setTurns((p) => [...p, { source: t, translation: r.translation }]);
      speak(r.translation, targetBcp47, gender);
    } catch {
      toast.error("تعذّرت الترجمة.");
    }
  };

  const start = () => {
    if (!isSpeechRecognitionSupported()) { toast.error("الإدخال الصوتي غير مدعوم في هذا المتصفح."); return; }
    const SR = getSpeechRecognition();
    const rec = new SR();
    rec.lang = srcLang;
    rec.continuous = true;
    rec.interimResults = true;
    rec.onresult = (e: any) => {
      let interimText = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const res = e.results[i];
        if (res.isFinal) handle(res[0].transcript);
        else interimText += res[0].transcript;
      }
      setInterim(interimText);
    };
    rec.onerror = () => {};
    rec.onend = () => { if (activeRef.current) { try { rec.start(); } catch {} } else setActive(false); };
    recRef.current = rec;
    activeRef.current = true;
    setActive(true);
    rec.start();
  };

  const stop = () => { activeRef.current = false; recRef.current?.stop?.(); setActive(false); setInterim(""); };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2 rounded-2xl border bg-card p-4">
        <div className="flex items-center gap-2 text-sm">
          <span className="text-muted-foreground">لغتك:</span>
          <select value={srcLang} onChange={(e) => setSrcLang(e.target.value)} disabled={active} className="rounded-xl border bg-background px-2 py-1">
            {LANGUAGES.map((l) => <option key={l.code} value={l.bcp47}>{l.nameAr}</option>)}
          </select>
        </div>
        <button
          onClick={active ? stop : start}
          className={`flex size-14 items-center justify-center rounded-full text-primary-foreground shadow-glow transition-transform hover:scale-105 ${active ? "gradient-accent animate-pulse" : "gradient-primary"}`}
        >
          {active ? <Square className="size-6" /> : <Mic className="size-6" />}
        </button>
      </div>
      <p className="text-center text-xs text-muted-foreground">
        {active ? "تحدّث بحرية... سيُترجم كلامك وينطق فوراً" : "اضغط الميكروفون وابدأ التحدّث بشكل مستمر"}
      </p>
      {interim && <div className="rounded-xl border border-dashed bg-muted/40 p-2 text-sm text-muted-foreground">{interim}</div>}

      <div className="space-y-2">
        {[...turns].reverse().map((t, i) => (
          <div key={turns.length - i} className="rounded-2xl border bg-card p-3">
            <p className="text-sm text-muted-foreground" dir="auto">{t.source}</p>
            <div className="mt-1 flex items-center justify-between gap-2">
              <p className="font-semibold" dir="auto">{t.translation}</p>
              <button onClick={() => speak(t.translation, targetBcp47, gender)} className="text-muted-foreground hover:text-foreground"><Volume2 className="size-4" /></button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
