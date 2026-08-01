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
