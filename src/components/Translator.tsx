import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { translateText, translateImage } from "@/lib/translate.functions";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { LANGUAGES, langByCode } from "@/lib/languages";
import { speak, stopSpeaking, getSpeechRecognition, isSpeechRecognitionSupported, type VoiceGender } from "@/lib/speech";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { toast } from "sonner";
import {
  Languages as LangIcon, Mic, Camera, Volume2, Copy, Star, Loader2,
  ArrowLeftRight, Square, Upload, Sparkles,
} from "lucide-react";

type Result = { detectedLang: string; translation: string; sourceText: string };

export function Translator() {
  const { user } = useAuth();
  const doText = useServerFn(translateText);
  const doImage = useServerFn(translateImage);

  const [targetLang, setTargetLang] = useState("en");
  const [text, setText] = useState("");
  const [result, setResult] = useState<Result | null>(null);
  const [busy, setBusy] = useState(false);
  const [gender, setGender] = useState<VoiceGender>("female");
  const [listening, setListening] = useState(false);
  const recognitionRef = useRef<any>(null);
  const fileRef = useRef<HTMLInputElement>(null);

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

  const handleImage = async (file: File) => {
    if (file.size > 8_000_000) { toast.error("حجم الصورة كبير جداً (الحد 8MB)."); return; }
    setBusy(true);
    setResult(null);
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const dataUrl = reader.result as string;
        const r = (await doImage({ data: { image: dataUrl, targetLang: targetMeta?.name ?? targetLang } })) as Result;
        setText(r.sourceText);
        setResult(r);
        await saveHistory(r, "image");
      } catch (err) {
        handleAiError(err);
      } finally {
        setBusy(false);
      }
    };
    reader.readAsDataURL(file);
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
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => e.target.files?.[0] && handleImage(e.target.files[0])}
          />
          <button
            onClick={() => fileRef.current?.click()}
            disabled={busy}
            className="flex w-full flex-col items-center gap-2 rounded-2xl border-2 border-dashed border-border bg-card p-10 transition-colors hover:border-primary"
          >
            {busy ? <Loader2 className="size-8 animate-spin text-primary" /> : <Upload className="size-8 text-primary" />}
            <span className="font-medium">اختر صورة تحتوي على نص</span>
            <span className="text-xs text-muted-foreground">سيتم استخراج النص وترجمته تلقائياً</span>
          </button>
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
