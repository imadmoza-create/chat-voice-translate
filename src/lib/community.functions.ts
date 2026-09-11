import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { moderateText } from "@/lib/moderation";

export type CommunityMessage = {
  id: string;
  lang: string;
  user_id: string;
  display_name: string | null;
  account_number: number | null;
  content: string;
  created_at: string;
};

export type BanStatus = {
  banned: boolean;
  until: string | null;
  reason: string | null;
  strikes: number;
};

const STRIKE_LIMIT = 3; // عدد المخالفات قبل الحظر التلقائي
const BAN_DAYS = 3; // مدة الحظر بالأيام

async function computeBan(supabase: any, userId: string): Promise<BanStatus> {
  const { data: ban } = await supabase
    .from("user_bans")
    .select("until, reason")
    .eq("user_id", userId)
    .gt("until", new Date().toISOString())
    .order("until", { ascending: false })
    .limit(1)
    .maybeSingle();
  const { data: strike } = await supabase
    .from("user_strikes")
    .select("count")
    .eq("user_id", userId)
    .maybeSingle();
  return {
    banned: !!ban,
    until: ban?.until ?? null,
    reason: ban?.reason ?? null,
    strikes: strike?.count ?? 0,
  };
}

export const getBanStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<BanStatus> => {
    return computeBan(context.supabase, context.userId);
  });

export const getCommunityMessages = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ lang: z.string().min(2).max(10) }).parse(input))
  .handler(async ({ data, context }): Promise<CommunityMessage[]> => {
    const { data: rows, error } = await context.supabase
      .from("community_messages")
      .select("id, lang, user_id, display_name, account_number, content, created_at")
      .eq("lang", data.lang)
      .order("created_at", { ascending: true })
      .limit(200);
    if (error) throw new Error(error.message);
    return (rows ?? []) as CommunityMessage[];
  });

export type PostResult =
  | { ok: true; message: CommunityMessage }
  | { ok: false; reason: "banned"; until: string | null; hits?: string[] }
  | {
      ok: false;
      reason: "flagged";
      hits: string[];
      strikes: number;
      banned: boolean;
      until: string | null;
    };

export const postCommunityMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        lang: z.string().min(2).max(10),
        content: z.string().min(1).max(1000),
      })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<PostResult> => {
    const { supabase, userId } = context;

    // 1) تحقق من الحظر الحالي
    const status = await computeBan(supabase, userId);
    if (status.banned) return { ok: false, reason: "banned", until: status.until };

    // 2) فلترة الألفاظ البذيئة/المزعجة
    const mod = moderateText(data.content);
    if (!mod.clean) {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const newCount = (status.strikes ?? 0) + 1;
      await supabaseAdmin
        .from("user_strikes")
        .upsert(
          { user_id: userId, count: newCount, updated_at: new Date().toISOString() },
          { onConflict: "user_id" },
        );

      if (newCount >= STRIKE_LIMIT) {
        const until = new Date(Date.now() + BAN_DAYS * 86400000).toISOString();
        await supabaseAdmin.from("user_bans").insert({
          user_id: userId,
          until,
          reason: `حظر تلقائي بسبب استخدام ألفاظ غير لائقة (${mod.hits.join("، ")})`,
        });
        // صفّر العدّاد بعد الحظر
        await supabaseAdmin
          .from("user_strikes")
          .upsert(
            { user_id: userId, count: 0, updated_at: new Date().toISOString() },
            { onConflict: "user_id" },
          );
        return {
          ok: false,
          reason: "flagged",
          hits: mod.hits,
          strikes: newCount,
          banned: true,
          until,
        };
      }
      return {
        ok: false,
        reason: "flagged",
        hits: mod.hits,
        strikes: newCount,
        banned: false,
        until: null,
      };
    }

    // 3) رسالة نظيفة — احضر بيانات الحساب وانشر
    const { data: profile } = await supabase
      .from("profiles")
      .select("display_name, account_number")
      .eq("id", userId)
      .maybeSingle();

    const { data: inserted, error } = await supabase
      .from("community_messages")
      .insert({
        lang: data.lang,
        user_id: userId,
        display_name: profile?.display_name ?? null,
        account_number: profile?.account_number ?? null,
        content: data.content.trim(),
      })
      .select("id, lang, user_id, display_name, account_number, content, created_at")
      .single();
    if (error) throw new Error(error.message);
    return { ok: true, message: inserted as CommunityMessage };
  });
