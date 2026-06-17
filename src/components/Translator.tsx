import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { translateText } from "@/lib/translate.functions";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { LANGUAGES, langByCode } from "@/lib/languages";
import { speak, stopSpeaking, getSpeechRecognition, isSpeechRecognitionSupported, type VoiceGender } from "@/lib/speech";
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
  Square, Upload, Sparkles,
} from "lucide-react";

type Result = { detectedLang: string; translation: string; sourceText: string; conjugations?: Conjugation[] };

export function Translator() {
  const { user } = useAuth();
  const doText = useServerFn(translateText);

  const [targetLang, setTargetLang] = useState("en");
  const [text, setText] = useState("");
  const [result, setResult] = useState<Result | null>(null);
  const [busy, setBusy] = useState(false);
  const [gender, setGender] = useState<VoiceGender>("female");
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
        <TabsList className="grid w-full grid-cols-3 rounded-xl">
          <TabsTrigger value="text" className="rounded-lg gap-1.5"><LangIcon className="size-4" /> نص</TabsTrigger>
          <TabsTrigger value="voice" className="rounded-lg gap-1.5"><Mic className="size-4" /> صوت</TabsTrigger>
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
            <div className="flex items-center gap-1 rounded-xl bg-muted p-1">
              <button
                onClick={() => setGender("female")}
                className={`rounded-lg px-3 py-1 text-xs font-medium transition-colors ${gender === "female" ? "bg-card shadow-sm text-foreground" : "text-muted-foreground"}`}
              >أنثى</button>
              <button
                onClick={() => setGender("male")}
                className={`rounded-lg px-3 py-1 text-xs font-medium transition-colors ${gender === "male" ? "bg-card shadow-sm text-foreground" : "text-muted-foreground"}`}
              >ذكر</button>
            </div>
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
        </div>
      )}
    </div>
  );
}
