// Server-only Google AI (Gemini) direct calls using the user's GOOGLE_API_KEY.
// Used when the key is configured; callers fall back to the Lovable AI
// Gateway when it is missing or the call fails.

const API_BASE = "https://generativelanguage.googleapis.com/v1beta/models";

export const GOOGLE_TEXT_MODEL = "gemini-2.5-flash";
export const GOOGLE_VISION_MODEL = "gemini-2.5-pro";
export const GOOGLE_TTS_MODEL = "gemini-2.5-flash-preview-tts";

export function getGoogleApiKey(): string | null {
  const k = process.env["GOOGLE_API_KEY"];
  return k && k.trim() ? k.trim() : null;
}

type Part = { text?: string; inlineData?: { mimeType: string; data: string } };

type IncomingMessage = { role: string; content: unknown };

function toGeminiContents(messages: IncomingMessage[]) {
  let system: string | undefined;
  const contents: Array<{ role: string; parts: Part[] }> = [];
  for (const m of messages) {
    if (m.role === "system") {
      system = String(m.content ?? "");
      continue;
    }
    const role = m.role === "assistant" ? "model" : "user";
    const parts: Part[] = [];
    if (typeof m.content === "string") {
      parts.push({ text: m.content });
    } else if (Array.isArray(m.content)) {
      for (const item of m.content as Array<Record<string, any>>) {
        if (item?.type === "text") {
          parts.push({ text: String(item.text ?? "") });
        } else if (item?.type === "image_url") {
          const url = String(item.image_url?.url ?? "");
          const match = url.match(/^data:([^;]+);base64,(.*)$/);
          if (match) parts.push({ inlineData: { mimeType: match[1], data: match[2] } });
        }
      }
    }
    if (parts.length) contents.push({ role, parts });
  }
  return { system, contents };
}

// Text / vision generation. Returns the model's text output.
export async function geminiGenerate(
  model: string,
  messages: IncomingMessage[],
  opts: { json?: boolean } = {},
): Promise<string> {
  const key = getGoogleApiKey();
  if (!key) throw new Error("NO_GOOGLE_KEY");
  const { system, contents } = toGeminiContents(messages);
  const res = await fetch(`${API_BASE}/${model}:generateContent`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": key },
    body: JSON.stringify({
      ...(system ? { systemInstruction: { parts: [{ text: system }] } } : {}),
      contents,
      generationConfig: opts.json ? { responseMimeType: "application/json" } : {},
    }),
  });
  if (res.status === 429) throw new Error("RATE_LIMIT");
  if (res.status === 402) throw new Error("CREDITS");
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(`Google AI error ${res.status}: ${t.slice(0, 200)}`);
  }
  const data = await res.json();
  const parts = data?.candidates?.[0]?.content?.parts ?? [];
  return parts.map((p: any) => String(p?.text ?? "")).join("");
}

function b64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

function pcmToWav(pcm: Uint8Array, sampleRate: number): ArrayBuffer {
  const buf = new ArrayBuffer(44 + pcm.length);
  const v = new DataView(buf);
  const wstr = (o: number, s: string) => {
    for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i));
  };
  wstr(0, "RIFF");
  v.setUint32(4, 36 + pcm.length, true);
  wstr(8, "WAVE");
  wstr(12, "fmt ");
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true); // PCM
  v.setUint16(22, 1, true); // mono
  v.setUint32(24, sampleRate, true);
  v.setUint32(28, sampleRate * 2, true);
  v.setUint16(32, 2, true);
  v.setUint16(34, 16, true);
  wstr(36, "data");
  v.setUint32(40, pcm.length, true);
  new Uint8Array(buf, 44).set(pcm);
  return buf;
}

// Text-to-speech via Gemini TTS. Returns a WAV audio buffer.
export async function geminiTts(text: string, voiceName: string): Promise<ArrayBuffer> {
  const key = getGoogleApiKey();
  if (!key) throw new Error("NO_GOOGLE_KEY");
  const res = await fetch(`${API_BASE}/${GOOGLE_TTS_MODEL}:generateContent`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": key },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text }] }],
      generationConfig: {
        responseModalities: ["AUDIO"],
        speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName } } },
      },
    }),
  });
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(`Google TTS error ${res.status}: ${t.slice(0, 200)}`);
  }
  const data = await res.json();
  const b64 = data?.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
  if (!b64) throw new Error("Google TTS: no audio returned");
  return pcmToWav(b64ToBytes(b64), 24000);
}
