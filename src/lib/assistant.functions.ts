import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const GATEWAY_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";
const MODEL = "google/gemini-3-flash-preview";

export type AssistantMessage = { role: "user" | "assistant"; content: string };

const SYSTEM_PROMPT = `أنت مساعد ذكاء اصطناعي عام ومحادث طبيعي داخل تطبيق تعليمي.
- تجيب بحرية وبشكل طبيعي عن أي موضوع أو سؤال، وليس بردود ثابتة مُعدّة مسبقاً.
- تتذكّر سياق المحادثة الحالية وتبني إجاباتك عليه لتكون مترابطة.
- تدعم العربية والإيطالية والإنجليزية. أجب دائماً بنفس لغة رسالة المستخدم الأخيرة؛ وإذا طلب لغة معيّنة فالتزم بها.
- يمكنك شرح المواضيع بوضوح، والترجمة بين اللغات، والمساعدة في الدراسة والواجبات، والإجابة عن الأسئلة العامة.
- كن مختصراً ومباشراً عند الأسئلة البسيطة، ومفصّلاً ومنظّماً (نقاط/عناوين) عند المواضيع المعقّدة.
- استخدم تنسيق Markdown عند الحاجة (قوائم، عناوين، أكواد).`;

export const askAssistant = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        messages: z
          .array(
            z.object({
              role: z.enum(["user", "assistant"]),
              content: z.string().min(1).max(8000),
            }),
          )
          .min(1)
          .max(40),
      })
      .parse(input),
  )
  .handler(async ({ data }): Promise<{ reply: string }> => {
    const key = process.env.LOVABLE_API_KEY;
    if (!key) throw new Error("Missing LOVABLE_API_KEY");

    const messages = [{ role: "system", content: SYSTEM_PROMPT }, ...data.messages];

    const res = await fetch(GATEWAY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({ model: MODEL, messages }),
    });
    if (res.status === 429) throw new Error("RATE_LIMIT");
    if (res.status === 402) throw new Error("CREDITS");
    if (!res.ok) throw new Error(`AI error ${res.status}`);

    const json = await res.json();
    const reply = String(json?.choices?.[0]?.message?.content ?? "").trim();
    return { reply: reply || "…" };
  });
