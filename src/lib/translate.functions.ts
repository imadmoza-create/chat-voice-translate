import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const GATEWAY_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";
const MODEL = "google/gemini-3-flash-preview";

const TextInput = z.object({
  text: z.string().min(1).max(5000),
  targetLang: z.string().min(2).max(40),
});

const ImageInput = z.object({
  image: z.string().min(10).max(12_000_000), // data URL
  targetLang: z.string().min(2).max(40),
});

type TranslateResult = {
  detectedLang: string;
  translation: string;
  sourceText: string;
};

function buildSystemPrompt(targetLang: string) {
  return `You are an expert translator. Detect the source language and translate the user's content into ${targetLang}.
Respond ONLY with a strict JSON object, no markdown, in this exact shape:
{"detectedLang": "<source language name in Arabic>", "sourceText": "<the original text>", "translation": "<the translated text in ${targetLang}>"}
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
  return {
    detectedLang: String(obj.detectedLang ?? ""),
    translation: String(obj.translation ?? ""),
    sourceText: String(obj.sourceText ?? ""),
  };
}

async function callGateway(messages: unknown[]): Promise<TranslateResult> {
  const key = process.env.LOVABLE_API_KEY;
  if (!key) throw new Error("Missing LOVABLE_API_KEY");

  const res = await fetch(GATEWAY_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({ model: MODEL, messages }),
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
    return callGateway([
      { role: "system", content: buildSystemPrompt(data.targetLang) },
      {
        role: "user",
        content: [
          {
            type: "text",
            text: "Extract all readable text from this image and translate it. Put the extracted original text in sourceText.",
          },
          { type: "image_url", image_url: { url: data.image } },
        ],
      },
    ]);
  });
