import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const GATEWAY_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";
const MODEL = "google/gemini-3-flash-preview";

const UiInput = z.object({
  texts: z.array(z.string().min(1).max(600)).min(1).max(60),
  targetLang: z.string().min(2).max(40),
});

// ترجمة نصوص واجهة المستخدم (أزرار، عناوين، تلميحات) دفعة واحدة
export const translateUiStrings = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => UiInput.parse(input))
  .handler(async ({ data }): Promise<{ translations: string[] }> => {
    const key = process.env["LOVABLE_API_KEY"];
    if (!key) throw new Error("Missing LOVABLE_API_KEY");

    const sys = `You localize a mobile app UI. Translate each string of the JSON array from Arabic into ${data.targetLang}.
Rules:
- Keep it short and natural for UI labels/buttons/headings.
- Preserve emojis, numbers, punctuation, leading/trailing spaces and placeholders like {x}, #, %, ✓.
- Do NOT translate brand names or proper nouns.
- Respond ONLY with a strict JSON array of strings, same length and order as input. No markdown.`;

    const res = await fetch(GATEWAY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          { role: "system", content: sys },
          { role: "user", content: JSON.stringify(data.texts) },
        ],
      }),
    });
    if (res.status === 429) throw new Error("RATE_LIMIT");
    if (res.status === 402) throw new Error("CREDITS");
    if (!res.ok) throw new Error(`AI error ${res.status}`);

    const json = await res.json();
    let raw = String(json?.choices?.[0]?.message?.content ?? "").trim();
    const fence = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (fence) raw = fence[1].trim();
    const start = raw.indexOf("[");
    const end = raw.lastIndexOf("]");
    if (start !== -1 && end !== -1) raw = raw.slice(start, end + 1);

    let arr: unknown = [];
    try {
      arr = JSON.parse(raw);
    } catch {
      arr = [];
    }
    const translations =
      Array.isArray(arr) && arr.length === data.texts.length
        ? arr.map((x, i) => String(x ?? data.texts[i]))
        : data.texts;
    return { translations };
  });
