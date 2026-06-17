import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const GATEWAY_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";
const MODEL = "google/gemini-3-flash-preview";
// Stronger multimodal model for accurate OCR.
const VISION_MODEL = "google/gemini-2.5-pro";

const TextInput = z.object({
  text: z.string().min(1).max(5000),
  targetLang: z.string().min(2).max(40),
});

const ImageInput = z.object({
  image: z.string().min(10).max(12_000_000), // data URL
  targetLang: z.string().min(2).max(40),
});

export type Conjugation = { pronoun: string; form: string; example: string };

type TranslateResult = {
  detectedLang: string;
  translation: string;
  sourceText: string;
  conjugations: Conjugation[];
};

function buildSystemPrompt(targetLang: string) {
  return `You are an expert translator and linguist. Detect the source language and translate the user's content into ${targetLang}.
Additionally, if the translated content is (or contains) a single main VERB, provide its full present-tense conjugation in ${targetLang}, ordered by grammatical person (I, you, he/she, we, you plural, they). Each conjugation must include a short natural EXAMPLE sentence in ${targetLang}. If the content is not a verb, return an empty conjugations array.
Respond ONLY with a strict JSON object, no markdown, in this exact shape:
{"detectedLang": "<source language name in Arabic>", "sourceText": "<the original text>", "translation": "<the translated text in ${targetLang}>", "conjugations": [{"pronoun": "<pronoun in ${targetLang}>", "form": "<conjugated verb form>", "example": "<example sentence>"}]}
Keep the translation natural and faithful. Do not add explanations.`;
}

function parseAi(content: string): TranslateResult {
  let raw = content.trim();
  const fence = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) raw = fence[1].trim();
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start !== -1 && end !== -1) raw = raw.slice(start, end + 1);
  const obj = JSON.parse(raw);
  const conjugations = Array.isArray(obj.conjugations)
    ? obj.conjugations
        .map((c: any) => ({
          pronoun: String(c?.pronoun ?? ""),
          form: String(c?.form ?? ""),
          example: String(c?.example ?? ""),
        }))
        .filter((c: Conjugation) => c.form)
    : [];
  return {
    detectedLang: String(obj.detectedLang ?? ""),
    translation: String(obj.translation ?? ""),
    sourceText: String(obj.sourceText ?? ""),
    conjugations,
  };
}

async function callGateway(messages: unknown[], model = MODEL): Promise<TranslateResult> {
  const key = process.env.LOVABLE_API_KEY;
  if (!key) throw new Error("Missing LOVABLE_API_KEY");

  const res = await fetch(GATEWAY_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({ model, messages }),
  });

  if (res.status === 429) throw new Error("RATE_LIMIT");
  if (res.status === 402) throw new Error("CREDITS");
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`AI error ${res.status}: ${t.slice(0, 200)}`);
  }

  const data = await res.json();
  const content = data?.choices?.[0]?.message?.content ?? "";
  return parseAi(content);
}

export const translateText = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => TextInput.parse(input))
  .handler(async ({ data }) => {
    return callGateway([
      { role: "system", content: buildSystemPrompt(data.targetLang) },
      { role: "user", content: data.text },
    ]);
  });

export const translateImage = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => ImageInput.parse(input))
  .handler(async ({ data }) => {
    return callGateway(
      [
        { role: "system", content: buildSystemPrompt(data.targetLang) },
        {
          role: "user",
          content: [
            {
              type: "text",
              text: "You are a high-accuracy OCR engine. Carefully extract ALL readable text from this image exactly as written, preserving line breaks, numbers, punctuation and diacritics. Do not guess or hallucinate text that is not clearly visible. Put the exact extracted original text in sourceText, then translate it.",
            },
            { type: "image_url", image_url: { url: data.image } },
          ],
        },
      ],
      VISION_MODEL,
    );
  });
