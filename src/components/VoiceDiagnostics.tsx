import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Stethoscope, CheckCircle2, XCircle, AlertTriangle, Loader2 } from "lucide-react";

type Status = "ok" | "fail" | "warn";
type Check = { id: string; title: string; status: Status; detail: string; fix?: string };

const ok = (id: string, title: string, detail: string): Check => ({ id, title, status: "ok", detail });

export function VoiceDiagnostics() {
  const [running, setRunning] = useState(false);
  const [checks, setChecks] = useState<Check[] | null>(null);

  const run = async () => {
    setRunning(true);
    const out: Check[] = [];

    // 1) الإنترنت
    if (typeof navigator !== "undefined" && navigator.onLine) {
      out.push(ok("net", "الاتصال بالإنترنت", "الاتصال متاح."));
    } else {
      out.push({
        id: "net",
        title: "الاتصال بالإنترنت",
        status: "fail",
        detail: "جهازك غير متصل بالإنترنت.",
        fix: "فعّل الواي فاي أو بيانات الهاتف ثم أعد الفحص.",
      });
    }

    // 2) دعم المتصفح للتعرّف على الكلام
    const w = window as unknown as Record<string, unknown>;
    const hasSR = Boolean(w["SpeechRecognition"] || w["webkitSpeechRecognition"]);
    out.push(
      hasSR
        ? ok("sr", "التعرّف على الكلام", "متصفحك يدعم تحويل الكلام إلى نص.")
        : {
            id: "sr",
            title: "التعرّف على الكلام",
            status: "fail",
            detail: "متصفحك لا يدعم الاستماع للكلام.",
            fix: "افتح التطبيق بمتصفح Chrome أو Safari الحديث (لا تستخدم متصفح داخل تطبيق آخر).",
          },
    );

    // 3) إذن الميكروفون
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach((t) => t.stop());
      out.push(ok("mic", "الميكروفون", "الميكروفون يعمل والإذن ممنوح."));
    } catch {
      out.push({
        id: "mic",
        title: "الميكروفون",
        status: "fail",
        detail: "لم نتمكن من استخدام الميكروفون.",
        fix: "اسمح للتطبيق باستخدام الميكروفون من إعدادات المتصفح (أيقونة القفل بجانب العنوان)، ثم أعد الفحص.",
      });
    }

    // 4) تشغيل الصوت
    const hasAudio = typeof window !== "undefined" && "Audio" in window;
    const hasTTS = typeof window !== "undefined" && "speechSynthesis" in window;
    out.push(
      hasAudio
        ? ok(
            "audio",
            "تشغيل الصوت",
            hasTTS ? "سماعة الجهاز والنطق الاحتياطي جاهزان." : "سماعة الجهاز جاهزة.",
          )
        : {
            id: "audio",
            title: "تشغيل الصوت",
            status: "fail",
            detail: "المتصفح لا يسمح بتشغيل الصوت.",
            fix: "حدّث المتصفح، وتأكد أن وضع الصامت مُطفأ ومستوى الصوت مرتفع.",
          },
    );

    // 5) تسجيل الدخول
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    out.push(
      token
        ? ok("auth", "تسجيل الدخول", "جلستك سارية.")
        : {
            id: "auth",
            title: "تسجيل الدخول",
            status: "fail",
            detail: "لا توجد جلسة دخول سارية.",
            fix: "سجّل الخروج ثم ادخل مجدداً بالبريد الإلكتروني.",
          },
    );

    // 6) خدمة صوت المعلم
    if (token) {
      try {
        const res = await fetch("/api/tts", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({ text: "ok", lang: "en-US", gender: "female" }),
        });
        if (res.ok) {
          out.push(ok("tts", "صوت المعلم الطبيعي", "الخدمة تستجيب بشكل سليم."));
        } else if (res.status === 429) {
          out.push({
            id: "tts",
            title: "صوت المعلم الطبيعي",
            status: "warn",
            detail: "تم تجاوز عدد الطلبات المسموح مؤقتاً.",
            fix: "انتظر دقيقة ثم أعد المحاولة؛ سيُستخدم الصوت الاحتياطي حتى ذلك الحين.",
          });
        } else {
          out.push({
            id: "tts",
            title: "صوت المعلم الطبيعي",
            status: "warn",
            detail: `الخدمة غير متاحة الآن (${res.status}).`,
            fix: "المحادثة تعمل بالصوت الاحتياطي للمتصفح. أعد الفحص لاحقاً.",
          });
        }
      } catch {
        out.push({
          id: "tts",
          title: "صوت المعلم الطبيعي",
          status: "warn",
          detail: "تعذّر الوصول إلى الخدمة.",
          fix: "تحقق من قوة الشبكة، وسيُستخدم الصوت الاحتياطي مؤقتاً.",
        });
      }
    }

    setChecks(out);
    setRunning(false);
  };

  const problems = checks?.filter((c) => c.status !== "ok") ?? [];

  return (
    <div className="rounded-2xl border bg-card p-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-sm font-bold">
          <Stethoscope className="size-4 text-primary" /> تشخيص المشكلة وعلاجها
        </h2>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="rounded-xl gap-1.5"
          onClick={() => void run()}
          disabled={running}
        >
          {running ? <Loader2 className="size-4 animate-spin" /> : null}
          {running ? "جارِ الفحص..." : "افحص الآن"}
        </Button>
      </div>

      {!checks && !running && (
        <p className="mt-2 text-xs text-muted-foreground">
          لا تعمل المحادثة الصوتية؟ اضغط «افحص الآن» لنكتشف السبب ونعرض لك خطوات الحل.
        </p>
      )}

      {checks && (
        <div className="mt-3 space-y-2">
          <p className="text-xs font-semibold text-muted-foreground">
            {problems.length === 0
              ? "كل شيء سليم — يمكنك بدء المحادثة."
              : `وجدنا ${problems.length} مشكلة. الحلول بالأسفل.`}
          </p>
          {checks.map((c) => (
            <div key={c.id} className="rounded-xl border bg-background px-3 py-2">
              <div className="flex items-center gap-2 text-sm font-semibold">
                {c.status === "ok" ? (
                  <CheckCircle2 className="size-4 shrink-0 text-emerald-500" />
                ) : c.status === "warn" ? (
                  <AlertTriangle className="size-4 shrink-0 text-amber-500" />
                ) : (
                  <XCircle className="size-4 shrink-0 text-destructive" />
                )}
                {c.title}
              </div>
              <p className="mt-0.5 text-xs text-muted-foreground">{c.detail}</p>
              {c.fix && (
                <p className="mt-1 rounded-lg bg-primary/5 px-2 py-1 text-xs text-foreground">
                  الحل: {c.fix}
                </p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
