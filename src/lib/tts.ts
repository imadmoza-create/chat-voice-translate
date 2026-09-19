// نطق بصوت حقيقي (نموذج Google الصوتي) مع حفظ محلي دائم للجمل
// ليعمل تشغيلها مجدداً بدون إنترنت. عند تعذّر الشبكة أو الخدمة نعود
// تلقائياً إلى محرّك النطق داخل المتصفح.
import { supabase } from "@/integrations/supabase/client";

export type TtsGender = "female" | "male";

const DB_NAME = "tts-clips";
const STORE = "clips";
const MAX_CLIPS = 400;

function keyOf(text: string, bcp47: string, gender: TtsGender) {
  return `${bcp47}|${gender}|${text.trim()}`;
}

function openDb(): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    if (typeof indexedDB === "undefined") return resolve(null);
    try {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

async function readClip(key: string): Promise<Blob | null> {
  const db = await openDb();
  if (!db) return null;
  return new Promise((resolve) => {
    try {
      const req = db.transaction(STORE, "readonly").objectStore(STORE).get(key);
      req.onsuccess = () => resolve((req.result as Blob | undefined) ?? null);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

async function writeClip(key: string, blob: Blob) {
  const db = await openDb();
  if (!db) return;
  try {
    const tx = db.transaction(STORE, "readwrite");
    const store = tx.objectStore(STORE);
    store.put(blob, key);
    // تنظيف بسيط حتى لا تتضخم الذاكرة على الهاتف
    const countReq = store.count();
    countReq.onsuccess = () => {
      if (countReq.result <= MAX_CLIPS) return;
      const cur = store.openCursor();
      let toDelete = countReq.result - MAX_CLIPS;
      cur.onsuccess = () => {
        const c = cur.result;
        if (!c || toDelete <= 0) return;
        c.delete();
        toDelete--;
        c.continue();
      };
    };
  } catch {
    /* ignore */
  }
}

/** هل الجملة محفوظة محلياً (متاحة بدون إنترنت)؟ */
export async function isClipCached(text: string, bcp47: string, gender: TtsGender) {
  return !!(await readClip(keyOf(text, bcp47, gender)));
}

async function fetchClip(text: string, bcp47: string, gender: TtsGender): Promise<Blob | null> {
  try {
    if (typeof navigator !== "undefined" && navigator.onLine === false) return null;
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) return null;
    const res = await fetch("/api/tts", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ text, lang: bcp47, gender }),
    });
    if (!res.ok) return null;
    const blob = await res.blob();
    if (!blob.size) return null;
    return blob;
  } catch {
    return null;
  }
}

let currentAudio: HTMLAudioElement | null = null;
let currentUrl: string | null = null;

export function stopNeuralAudio() {
  if (currentAudio) {
    currentAudio.onended = null;
    currentAudio.onerror = null;
    currentAudio.pause();
    currentAudio = null;
  }
  if (currentUrl) {
    URL.revokeObjectURL(currentUrl);
    currentUrl = null;
  }
}

/**
 * يشغّل الجملة بالصوت الحقيقي. يُرجع true عند النجاح، و false إذا تعذّر
 * (وقتها ينبغي استخدام النطق المدمج في المتصفح).
 */
export async function playNeural(
  text: string,
  bcp47: string,
  gender: TtsGender,
  onEnd?: () => void,
  rate = 1,
): Promise<boolean> {
  if (typeof window === "undefined" || !text.trim()) return false;
  const key = keyOf(text, bcp47, gender);
  let blob = await readClip(key);
  if (!blob) {
    blob = await fetchClip(text, bcp47, gender);
    if (blob) void writeClip(key, blob);
  }
  if (!blob) return false;

  stopNeuralAudio();
  const url = URL.createObjectURL(blob);
  const audio = new Audio(url);
  audio.playbackRate = rate;
  currentAudio = audio;
  currentUrl = url;
  const finish = () => {
    if (currentAudio === audio) stopNeuralAudio();
    onEnd?.();
  };
  audio.onended = finish;
  audio.onerror = finish;
  try {
    await audio.play();
    return true;
  } catch {
    stopNeuralAudio();
    return false;
  }
}

/** حفظ مسبق لجملة المعلّم لتعمل لاحقاً بدون إنترنت (بدون تشغيلها). */
export async function prefetchClip(text: string, bcp47: string, gender: TtsGender) {
  if (!text.trim()) return;
  const key = keyOf(text, bcp47, gender);
  if (await readClip(key)) return;
  const blob = await fetchClip(text, bcp47, gender);
  if (blob) void writeClip(key, blob);
}
