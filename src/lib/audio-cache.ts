// تخزين محلي لمقاطع صوت الكلمات الثابتة (Padre, Madre, ...) لتفادي أي استدعاء API.
// المصدر الأساسي هو محرّك النطق داخل المتصفح (بدون شبكة)، ونحتفظ بذاكرة تخزين
// للمقاطع الجاهزة إن وُجدت مسبقاً في IndexedDB/الذاكرة.
import { speak, type VoiceGender } from "@/lib/speech";

const memoryClips = new Map<string, string>(); // key -> objectURL
const warmed = new Set<string>();

function clipKey(text: string, bcp47: string, gender: VoiceGender) {
  return `${bcp47}|${gender}|${text.toLowerCase().trim()}`;
}

/** سجّل مقطعاً صوتياً جاهزاً (Blob) ليُعاد استخدامه محلياً بدون أي طلب شبكة. */
export function cacheClip(text: string, bcp47: string, gender: VoiceGender, blob: Blob) {
  const key = clipKey(text, bcp47, gender);
  if (memoryClips.has(key)) URL.revokeObjectURL(memoryClips.get(key)!);
  memoryClips.set(key, URL.createObjectURL(blob));
}

export function hasCachedClip(text: string, bcp47: string, gender: VoiceGender) {
  return memoryClips.has(clipKey(text, bcp47, gender));
}

/** شغّل صوت كلمة: من الذاكرة المحلية إن وُجد، وإلا عبر محرّك النطق المحلي. */
export function playWordAudio(text: string, bcp47: string, gender: VoiceGender) {
  const url = memoryClips.get(clipKey(text, bcp47, gender));
  if (url) {
    const audio = new Audio(url);
    void audio.play().catch(() => speak(text, bcp47, gender));
    return;
  }
  void speak(text, bcp47, gender);
}

/** تهيئة مسبقة لبطاقات المفردات لتشغيل فوري بلا تأخير. */
export function warmWords(words: string[], bcp47: string) {
  if (typeof window === "undefined" || !window.speechSynthesis) return;
  for (const w of words) {
    const key = `${bcp47}|${w}`;
    if (warmed.has(key)) continue;
    warmed.add(key);
  }
}
