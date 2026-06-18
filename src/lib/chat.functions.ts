import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const GATEWAY_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";
const MODEL = "google/gemini-3-flash-preview";

export type ChatMessage = { id: string; role: "user" | "assistant"; content: string; created_at: string };

const SYSTEM_PROMPT = `أنت "مساعد ترجملي"، مساعد ذكي ودود يجمع بين مهمتين:
1) مدرّس لغات: تصحّح أخطاء المستخدم، تشرح القواعد ببساطة، تعطي أمثلة، وتدرّب على المحادثة بأي لغة يطلبها.
2) مساعد عام: تجيب على الأسئلة العامة وتساعد في الترجمة والحوار.
أجب بنفس لغة المستخدم. كن مختصراً وواضحاً واستخدم تنسيق ماركداون عند الحاجة. عند تصحيح جملة، اعرض النسخة الصحيحة ثم اشرح السبب بإيجاز.`;

export const getChatMessages = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<ChatMessage[]> => {
    const { data, error } = await context.supabase
      .from("chat_messages")
      .select("id, role, content, created_at")
      .eq("user_id", context.userId)
      .order("created_at", { ascending: true })
      .limit(200);
    if (error) throw new Error(error.message);
    return (data ?? []) as ChatMessage[];
  });

export const clearChat = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { error } = await context.supabase
      .from("chat_messages")
      .delete()
      .eq("user_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const sendChatMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ text: z.string().min(1).max(4000) }).parse(input))
  .handler(async ({ data, context }): Promise<{ reply: string }> => {
    const key = process.env.LOVABLE_API_KEY;
    if (!key) throw new Error("Missing LOVABLE_API_KEY");

    // احفظ رسالة المستخدم
    await context.supabase
      .from("chat_messages")
      .insert({ user_id: context.userId, role: "user", content: data.text });

    // اجلب آخر سجل للمحادثة كسياق
    const { data: history } = await context.supabase
      .from("chat_messages")
      .select("role, content")
      .eq("user_id", context.userId)
      .order("created_at", { ascending: false })
      .limit(20);

    const ordered = (history ?? []).reverse();
    const messages = [
      { role: "system", content: SYSTEM_PROMPT },
      ...ordered.map((m) => ({ role: m.role, content: m.content })),
    ];

    const res = await fetch(GATEWAY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({ model: MODEL, messages }),
    });
    if (res.status === 429) throw new Error("RATE_LIMIT");
    if (res.status === 402) throw new Error("CREDITS");
    if (!res.ok) throw new Error(`AI error ${res.status}`);
    const json = await res.json();
    const reply = String(json?.choices?.[0]?.message?.content ?? "").trim() || "عذراً، لم أتمكن من الرد.";

    await context.supabase
      .from("chat_messages")
      .insert({ user_id: context.userId, role: "assistant", content: reply });

    return { reply };
  });
