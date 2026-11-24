// Speech helpers: النطق الافتراضي بمحرّك الجهاز/المتصفح (مجاني وبلا شبكة).
// صوت الذكاء الاصطناعي يُستخدم فقط إذا فعّله المستخدم صراحةً من الإعدادات.
import { playNeural, stopNeuralAudio } from "@/lib/tts";
import { getNeuralTtsEnabled } from "@/lib/prefs";

export type VoiceGender = "female" | "male";

let cachedVoices: SpeechSynthesisVoice[] = [];
let speechGeneration = 0;

export function loadVoices(): Promise<SpeechSynthesisVoice[]> {
  return new Promise((resolve) => {
    if (typeof window === "undefined" || !window.speechSynthesis) {
      resolve([]);
      return;
    }
    const synth = window.speechSynthesis;
    const existing = synth.getVoices();
    if (existing.length) {
      cachedVoices = existing;
      resolve(existing);
      return;
    }
    let settled = false;
    const finish = (voices: SpeechSynthesisVoice[]) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeout);
      cachedVoices = voices;
      resolve(voices);
    };
    const timeout = window.setTimeout(() => finish(synth.getVoices()), 1200);
    synth.onvoiceschanged = () => finish(synth.getVoices());
  });
}

const FEMALE_HINTS = [
  "female",
  "woman",
  "zira",
  "samantha",
  "salma",
  "hoda",
  "amira",
  "google.*female",
  "femme",
];
const MALE_HINTS = ["male", "man", "david", "fred", "naayf", "majed", "homme", "google.*male"];

function pickVoice(voices: SpeechSynthesisVoice[], langPrefix: string, gender: VoiceGender) {
  const sameLang = voices.filter((v) => v.lang.toLowerCase().startsWith(langPrefix.toLowerCase()));
  const pool = sameLang.length ? sameLang : voices;
  const hints = gender === "female" ? FEMALE_HINTS : MALE_HINTS;
  const byName = pool.find((v) => hints.some((h) => new RegExp(h, "i").test(v.name)));
  if (byName) return byName;
  // Fallback: heuristic by index so male/female differ even without metadata
  if (pool.length > 1) return gender === "male" ? pool[pool.length - 1] : pool[0];
  return pool[0];
}

function speakDevicePart(
  text: string,
  bcp47: string,
  gender: VoiceGender,
  voices: SpeechSynthesisVoice[],
  rate: number,
) {
  return new Promise<void>((resolve) => {
    const synth = window.speechSynthesis;
    const utter = new SpeechSynthesisUtterance(text);
    utter.lang = bcp47;
    const v = pickVoice(voices, bcp47.split("-")[0] ?? bcp47, gender);
    if (v) utter.voice = v;
    utter.pitch = gender === "female" ? 1.15 : 0.8;
    utter.rate = rate;
    let settled = false;
    let watchdog = 0;
    const done = (timedOut = false) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(watchdog);
      utter.onend = null;
      utter.onerror = null;
      if (timedOut) {
        try {
          synth.cancel();
        } catch {
          /* ignore */
        }
      }
      resolve();
    };
    watchdog = window.setTimeout(() => done(true), Math.max(4000, text.length * 90) + 2000);
    utter.onend = () => done();
    utter.onerror = () => done();
    try {
      synth.speak(utter);
    } catch {
      done();
    }
  });
}

export async function speak(
  text: string,
  bcp47: string,
  gender: VoiceGender,
  onEnd?: () => void,
  rate = 0.98,
) {
  if (typeof window === "undefined" || !text) {
    onEnd?.();
    return;
  }
  stopSpeaking();
  const generation = speechGeneration;
  // 1) صوت الذكاء الاصطناعي فقط عند تفعيله صراحةً (مع إعادة استخدام النسخ المحفوظة)
  if (getNeuralTtsEnabled()) {
    const played = await playNeural(text, bcp47, gender, onEnd, rate);
    if (played || generation !== speechGeneration) return;
  }

  // 2) الافتراضي: محرّك النطق داخل الجهاز/المتصفح
  if (!window.speechSynthesis) {
    onEnd?.();
    return;
  }
  const voices = cachedVoices.length ? cachedVoices : await loadVoices();
  if (generation !== speechGeneration) return;
  const parts = text
    .split(/(?<=[.!?؟…])\s+|\n+/)
    .map((part) => part.trim())
    .filter(Boolean);
  for (const part of parts.length ? parts : [text]) {
    if (generation !== speechGeneration) return;
    await speakDevicePart(part, bcp47, gender, voices, rate);
  }
  if (generation === speechGeneration) onEnd?.();
}

export function stopSpeaking() {
  speechGeneration += 1;
  if (typeof window === "undefined") return;
  stopNeuralAudio();
  if (window.speechSynthesis) window.speechSynthesis.cancel();
}

// ---- Speech recognition ----
type SR = typeof window extends { SpeechRecognition: infer T } ? T : unknown;

export function getSpeechRecognition(): any | null {
  if (typeof window === "undefined") return null;
  return (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition || null;
}

export function isSpeechRecognitionSupported() {
  return !!getSpeechRecognition();
}

/**
 * عرض لحظي للنص أثناء التحدّث (interim results).
 * يعمل بالتوازي مع التسجيل، ويُرجع دالة إيقاف.
 */
export function startLiveTranscript(
  bcp47: string,
  onText: (text: string) => void,
  handlers?: { onError?: (code: string) => void; onRestart?: () => void },
): () => void {
  const SRClass = getSpeechRecognition();
  if (!SRClass) {
    handlers?.onError?.("not-supported");
    return () => {};
  }
  let stopped = false;
  let rec: any;
  let restartTimer: ReturnType<typeof setTimeout> | undefined;
  let backoff = 300;
  try {
    rec = new SRClass();
  } catch {
    handlers?.onError?.("init-failed");
    return () => {};
  }
  rec.lang = bcp47;
  rec.continuous = true;
  rec.interimResults = true;
  let finalText = "";
  const restart = () => {
    if (stopped) return;
    handlers?.onRestart?.();
    const delay = backoff;
    backoff = Math.min(backoff * 2, 3000);
    restartTimer = setTimeout(() => {
      if (stopped) return;
      try {
        rec.start();
        backoff = 300;
      } catch {
        restart();
      }
    }, delay);
  };
  rec.onresult = (ev: any) => {
    backoff = 300;
    let interim = "";
    for (let i = ev.resultIndex; i < ev.results.length; i++) {
      const r = ev.results[i];
      if (r.isFinal) finalText += r[0].transcript;
      else interim += r[0].transcript;
    }
    onText((finalText + " " + interim).trim());
  };
  rec.onerror = (ev: any) => {
    const code = String(ev?.error ?? "unknown");
    // "no-speech" و"aborted" طبيعية أثناء الصمت — لا تُعتبر أعطالاً
    if (code !== "no-speech" && code !== "aborted") handlers?.onError?.(code);
  };
  rec.onend = restart;
  try {
    rec.start();
  } catch {
    handlers?.onError?.("start-failed");
  }
  return () => {
    stopped = true;
    if (restartTimer) clearTimeout(restartTimer);
    try {
      rec.stop();
    } catch {
      /* ignore */
    }
  };
}

// ---- بثّ صوتي منخفض التأخير: انطق الجمل فور اكتمالها أثناء وصول البثّ ----
export function createSpeechStreamer(
  bcp47: string,
  gender: VoiceGender,
  onDone?: () => void,
  rate = 0.98,
) {
  let buffer = "";
  let speaking = false;
  const queue: string[] = [];
  let finished = false;
  let cancelled = false;
  let doneCalled = false;

  const finish = () => {
    if (doneCalled) return;
    doneCalled = true;
    onDone?.();
  };

  const next = () => {
    if (cancelled) return;
    const chunk = queue.shift();
    if (!chunk) {
      speaking = false;
      if (finished) finish();
      return;
    }
    speaking = true;
    void speak(chunk, bcp47, gender, next, rate);
  };

  const flushSentences = (force: boolean) => {
    const re = /[^.!?؟…\n]*[.!?؟…\n]+/g;
    let m: RegExpExecArray | null;
    let lastIndex = 0;
    while ((m = re.exec(buffer))) {
      const s = m[0].trim();
      if (s) queue.push(s);
      lastIndex = re.lastIndex;
    }
    buffer = buffer.slice(lastIndex);
    if (force && buffer.trim()) {
      queue.push(buffer.trim());
      buffer = "";
    }
    if (!speaking) next();
  };

  return {
    push(delta: string) {
      if (cancelled) return;
      buffer += delta;
      flushSentences(false);
    },
    end() {
      if (finished || cancelled) return;
      finished = true;
      flushSentences(true);
    },
    cancel() {
      cancelled = true;
      queue.length = 0;
      buffer = "";
      stopSpeaking();
    },
  };
}

/**
 * كشف مقاطعة الطالب: يراقب مستوى الميكروفون وينادي onSpeech فور بدء الكلام.
 * يُستخدم لإيقاف صوت المدرّس فوراً.
 */
export async function startBargeInDetector(onSpeech: () => void): Promise<() => void> {
  if (typeof window === "undefined" || !navigator.mediaDevices?.getUserMedia) return () => {};
  let stopped = false;
  let stream: MediaStream | null = null;
  let ctx: AudioContext | null = null;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const source = ctx.createMediaStreamSource(stream);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 512;
    source.connect(analyser);
    const buf = new Uint8Array(analyser.frequencyBinCount);
    const tick = () => {
      if (stopped) return;
      analyser.getByteTimeDomainData(buf);
      let peak = 0;
      for (let i = 0; i < buf.length; i++) peak = Math.max(peak, Math.abs(buf[i] - 128));
      if (peak > 18) {
        onSpeech();
        return;
      }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  } catch {
    return () => {};
  }
  return () => {
    stopped = true;
    stream?.getTracks().forEach((t) => t.stop());
    void ctx?.close();
  };
}

/**
 * مقياس مستوى الميكروفون المستمر — للمرئيات (Visualizer) وكشف المقاطعة.
 * يُرجع دالة إيقاف.
 */
export async function startMicMeter(onLevel: (level: number) => void): Promise<() => void> {
  if (typeof window === "undefined" || !navigator.mediaDevices?.getUserMedia) return () => {};
  let stopped = false;
  let stream: MediaStream | null = null;
  let ctx: AudioContext | null = null;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const source = ctx.createMediaStreamSource(stream);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 512;
    source.connect(analyser);
    const buf = new Uint8Array(analyser.frequencyBinCount);
    const tick = () => {
      if (stopped) return;
      analyser.getByteTimeDomainData(buf);
      let peak = 0;
      for (let i = 0; i < buf.length; i++) peak = Math.max(peak, Math.abs(buf[i] - 128));
      onLevel(Math.min(1, peak / 60));
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  } catch {
    return () => {};
  }
  return () => {
    stopped = true;
    stream?.getTracks().forEach((t) => t.stop());
    void ctx?.close();
  };
}
