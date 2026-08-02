// Browser speech helpers: text-to-speech (male/female) + speech recognition.

export type VoiceGender = "female" | "male";

let cachedVoices: SpeechSynthesisVoice[] = [];

export function loadVoices(): Promise<SpeechSynthesisVoice[]> {
  return new Promise((resolve) => {
    if (typeof window === "undefined" || !window.speechSynthesis) {
      resolve([]);
      return;
    }
    const existing = window.speechSynthesis.getVoices();
    if (existing.length) {
      cachedVoices = existing;
      resolve(existing);
      return;
    }
    window.speechSynthesis.onvoiceschanged = () => {
      cachedVoices = window.speechSynthesis.getVoices();
      resolve(cachedVoices);
    };
  });
}

const FEMALE_HINTS = ["female", "woman", "zira", "samantha", "salma", "hoda", "amira", "google.*female", "femme"];
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

export async function speak(text: string, bcp47: string, gender: VoiceGender, onEnd?: () => void) {
  if (typeof window === "undefined" || !window.speechSynthesis || !text) {
    onEnd?.();
    return;
  }
  window.speechSynthesis.cancel();
  const voices = cachedVoices.length ? cachedVoices : await loadVoices();
  const utter = new SpeechSynthesisUtterance(text);
  utter.lang = bcp47;
  const v = pickVoice(voices, bcp47.split("-")[0], gender);
  if (v) utter.voice = v;
  utter.pitch = gender === "female" ? 1.15 : 0.8;
  utter.rate = 0.98;
  if (onEnd) {
    utter.onend = () => onEnd();
    utter.onerror = () => onEnd();
  }
  window.speechSynthesis.speak(utter);
}


export function stopSpeaking() {
  if (typeof window !== "undefined" && window.speechSynthesis) window.speechSynthesis.cancel();
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
export function startLiveTranscript(bcp47: string, onText: (text: string) => void): () => void {
  const SRClass = getSpeechRecognition();
  if (!SRClass) return () => {};
  let stopped = false;
  let rec: any;
  try {
    rec = new SRClass();
  } catch {
    return () => {};
  }
  rec.lang = bcp47;
  rec.continuous = true;
  rec.interimResults = true;
  let finalText = "";
  rec.onresult = (ev: any) => {
    let interim = "";
    for (let i = ev.resultIndex; i < ev.results.length; i++) {
      const r = ev.results[i];
      if (r.isFinal) finalText += r[0].transcript;
      else interim += r[0].transcript;
    }
    onText((finalText + " " + interim).trim());
  };
  rec.onerror = () => {};
  rec.onend = () => {
    if (!stopped) {
      try {
        rec.start();
      } catch {
        /* ignore */
      }
    }
  };
  try {
    rec.start();
  } catch {
    /* ignore */
  }
  return () => {
    stopped = true;
    try {
      rec.stop();
    } catch {
      /* ignore */
    }
  };
}


// ---- بثّ صوتي منخفض التأخير: انطق الجمل فور اكتمالها أثناء وصول البثّ ----
export function createSpeechStreamer(bcp47: string, gender: VoiceGender, onDone?: () => void) {
  let buffer = "";
  let speaking = false;
  const queue: string[] = [];
  let finished = false;
  let cancelled = false;

  const next = () => {
    if (cancelled) return;
    const chunk = queue.shift();
    if (!chunk) {
      speaking = false;
      if (finished) onDone?.();
      return;
    }
    speaking = true;
    void speak(chunk, bcp47, gender, next);
  };

  const flushSentences = (force: boolean) => {
    const re = /[^.!?…\n]*[.!?…\n]+/g;
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
      finished = true;
      flushSentences(true);
      if (!speaking && queue.length === 0) onDone?.();
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
