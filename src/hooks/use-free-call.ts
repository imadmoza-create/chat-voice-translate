import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export type FreeCallStatus = "idle" | "connecting" | "connected" | "speaking" | "listening" | "stopping" | "closed";
export type FreeCallTurn = { role: "user" | "ai"; text: string };

type Opts = {
  bcp47: string;
  gender: "male" | "female" | string;
  payload: () => Record<string, unknown>;
  onTurn: (t: FreeCallTurn) => void;
};

/* eslint-disable @typescript-eslint/no-explicit-any */
export function useFreeCall({ bcp47, gender, payload, onTurn }: Opts) {
  const [status, setStatus] = useState<FreeCallStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [muted, setMutedState] = useState(false);
  const activeRef = useRef(false);
  const mutedRef = useRef(false);
  const speakingRef = useRef(false);
  const busyRef = useRef(false);
  const recRef = useRef<any>(null);
  const backoffRef = useRef(300);
  const wakeRef = useRef<any>(null);
  const optsRef = useRef({ bcp47, gender, payload, onTurn });
  optsRef.current = { bcp47, gender, payload, onTurn };

  const stopRec = () => {
    try { recRef.current?.abort(); } catch { /* ignore */ }
  };

  const startRec = useCallback(() => {
    if (!activeRef.current || mutedRef.current || speakingRef.current || busyRef.current) return;
    try { recRef.current?.start(); setStatus("listening"); } catch { /* already running */ }
  }, []);

  const pickVoice = () => {
    const voices = window.speechSynthesis.getVoices();
    const lang = optsRef.current.bcp47.toLowerCase();
    const base = lang.split("-")[0] ?? lang;
    const matching = voices.filter((v) => v.lang.toLowerCase().replace("_", "-").startsWith(base));
    // صوت المعلم عكس جنس الطالب
    const wantMale = optsRef.current.gender !== "male";
    const re = wantMale ? /male|man|david|daniel|google uk english male|giorgio|diego|thomas/i : /female|woman|samantha|zira|alice|elsa|google/i;
    return (
      matching.find((v) => v.lang.toLowerCase() === lang && re.test(v.name)) ??
      matching.find((v) => re.test(v.name)) ??
      matching.find((v) => v.lang.toLowerCase() === lang) ??
      matching[0]
    );
  };

  const speak = (text: string) =>
    new Promise<void>((resolve) => {
      const synth = window.speechSynthesis;
      if (!synth) return resolve();
      synth.cancel();
      stopRec();
      speakingRef.current = true;
      setStatus("speaking");
      const u = new SpeechSynthesisUtterance(text);
      u.lang = optsRef.current.bcp47;
      const v = pickVoice();
      if (v) u.voice = v;
      const done = () => {
        speakingRef.current = false;
        resolve();
      };
      u.onend = done;
      u.onerror = done;
      synth.speak(u);
    });

  const ask = useCallback(async (text: string, greeting = false) => {
    busyRef.current = true;
    stopRec();
    setStatus("connecting");
    try {
      const { data } = await supabase.auth.refreshSession();
      const token = data.session?.access_token ?? (await supabase.auth.getSession()).data.session?.access_token;
      if (!token) throw new Error("انتهت جلستك، سجّل الدخول مجدداً.");
      const res = await fetch("/api/voice-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ ...optsRef.current.payload(), text, greeting }),
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => null)) as { error?: string; message?: string } | null;
        if (j?.error === "NO_GOOGLE_KEY") throw new Error("خدمة المعلم غير مُعدّة (مفتاح Google مفقود).");
        if (res.status === 429) throw new Error("المعلم مشغول الآن، حاول مرة أخرى بعد لحظة.");
        throw new Error(j?.message ?? "تعذّر الحصول على ردّ المعلم.");
      }
      const raw = await res.text();
      let reply = "";
      for (const line of raw.split("\n")) {
        if (!line.startsWith("data: ") || line.includes("[DONE]")) continue;
        try { reply += JSON.parse(line.slice(6))?.choices?.[0]?.delta?.content ?? ""; } catch { /* ignore */ }
      }
      busyRef.current = false;
      if (!activeRef.current || !reply.trim()) return;
      setError(null);
      optsRef.current.onTurn({ role: "ai", text: reply.trim() });
      await speak(reply.trim());
    } catch (e) {
      setError(e instanceof Error ? e.message : "حدث خطأ.");
    } finally {
      busyRef.current = false;
      if (activeRef.current) {
        setStatus("connected");
        startRec();
      }
    }
  }, [startRec]);

  const cleanup = useCallback(() => {
    activeRef.current = false;
    speakingRef.current = false;
    busyRef.current = false;
    stopRec();
    recRef.current = null;
    try { window.speechSynthesis?.cancel(); } catch { /* ignore */ }
    try { wakeRef.current?.release?.(); } catch { /* ignore */ }
    wakeRef.current = null;
  }, []);

  const start = useCallback(async () => {
    setError(null);
    const w = window as any;
    const SR = w.SpeechRecognition || w.webkitSpeechRecognition;
    if (!SR) {
      setError("متصفحك لا يدعم الاستماع للكلام. افتح التطبيق في Chrome أو Safari الحديث.");
      return;
    }
    setStatus("connecting");
    try {
      const s = await navigator.mediaDevices.getUserMedia({ audio: true });
      s.getTracks().forEach((t) => t.stop());
    } catch {
      setError("لم يُسمح باستخدام الميكروفون. اسمح به من إعدادات المتصفح ثم حاول مجدداً.");
      setStatus("idle");
      return;
    }
    // فتح محرك النطق بإيماءة المستخدم (iOS)
    try { window.speechSynthesis.speak(new SpeechSynthesisUtterance("")); } catch { /* ignore */ }
    try { wakeRef.current = await (navigator as any).wakeLock?.request("screen"); } catch { /* ignore */ }

    const rec = new SR();
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = optsRef.current.bcp47;
    rec.onresult = (ev: any) => {
      if (speakingRef.current) {
        window.speechSynthesis.cancel();
        speakingRef.current = false;
      }
      for (let i = ev.resultIndex; i < ev.results.length; i++) {
        const r = ev.results[i];
        if (r.isFinal) {
          const t = String(r[0]?.transcript ?? "").trim();
          if (t) {
            backoffRef.current = 300;
            optsRef.current.onTurn({ role: "user", text: t });
            void ask(t);
          }
        }
      }
    };
    rec.onerror = (ev: any) => {
      if (ev.error === "not-allowed" || ev.error === "service-not-allowed") {
        setError("لم يُسمح باستخدام الميكروفون. اسمح به من إعدادات المتصفح.");
        activeRef.current = false;
        setStatus("closed");
      }
    };
    rec.onend = () => {
      if (!activeRef.current || speakingRef.current || busyRef.current || mutedRef.current) return;
      const delay = backoffRef.current;
      backoffRef.current = Math.min(delay * 2, 3000);
      setTimeout(startRec, delay);
    };
    recRef.current = rec;
    activeRef.current = true;
    setStatus("connected");
    void ask("", true);
  }, [ask, startRec]);

  const stop = useCallback(() => {
    setStatus("stopping");
    cleanup();
    setStatus("closed");
  }, [cleanup]);

  const setMuted = useCallback((m: boolean) => {
    mutedRef.current = m;
    setMutedState(m);
    if (speakingRef.current) {
      window.speechSynthesis.cancel();
      speakingRef.current = false;
    }
    if (m) stopRec();
    else startRec();
  }, [startRec]);

  const interrupt = useCallback(() => {
    if (speakingRef.current) {
      window.speechSynthesis.cancel();
      speakingRef.current = false;
    }
  }, []);

  useEffect(() => {
    const onHide = () => cleanup();
    window.addEventListener("pagehide", onHide);
    return () => {
      window.removeEventListener("pagehide", onHide);
      cleanup();
    };
  }, [cleanup]);

  return { status, error, muted, start, stop, setMuted, interrupt };
}
