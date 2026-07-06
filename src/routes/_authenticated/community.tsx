import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState, useCallback } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Users, Send, Loader2, ShieldAlert, Ban } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useAppLang } from "@/lib/prefs";
import { langByCode } from "@/lib/languages";
import {
  getCommunityMessages,
  postCommunityMessage,
  getBanStatus,
  type CommunityMessage,
  type BanStatus,
} from "@/lib/community.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/community")({
  head: () => ({ meta: [{ title: "دردشة المتعلمين — ترجملي" }] }),
  component: CommunityPage,
});

function fmtTime(iso: string) {
  try {
    return new Date(iso).toLocaleTimeString("ar", { hour: "2-digit", minute: "2-digit" });
  } catch {
    return "";
  }
}

function CommunityPage() {
  const { user } = useAuth();
  const [lang] = useAppLang();
  const langMeta = langByCode(lang);
  const langName = langMeta?.nameAr ?? lang;

  const loadMessages = useServerFn(getCommunityMessages);
  const postMessage = useServerFn(postCommunityMessage);
  const loadBan = useServerFn(getBanStatus);

  const [messages, setMessages] = useState<CommunityMessage[]>([]);
  const [ban, setBan] = useState<BanStatus | null>(null);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const endRef = useRef<HTMLDivElement>(null);

  const scrollDown = useCallback(() => {
    setTimeout(() => endRef.current?.scrollIntoView({ behavior: "smooth" }), 60);
  }, []);

  useEffect(() => {
    let active = true;
    setLoading(true);
    Promise.all([loadMessages({ data: { lang } }), loadBan()])
      .then(([msgs, b]) => {
        if (!active) return;
        setMessages(msgs);
        setBan(b);
        scrollDown();
      })
      .catch(() => toast.error("تعذّر تحميل الدردشة."))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [lang, loadMessages, loadBan, scrollDown]);

  // تحديث فوري للرسائل الجديدة في غرفة اللغة الحالية
  useEffect(() => {
    const channel = supabase
      .channel(`community-${lang}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "community_messages", filter: `lang=eq.${lang}` },
        (payload) => {
          const m = payload.new as CommunityMessage;
          setMessages((prev) => (prev.some((x) => x.id === m.id) ? prev : [...prev, m]));
          scrollDown();
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [lang, scrollDown]);

  async function send() {
    const content = input.trim();
    if (!content || busy) return;
    setBusy(true);
    try {
      const res = await postMessage({ data: { lang, content } });
      if (res.ok) {
        setInput("");
        setMessages((prev) => (prev.some((x) => x.id === res.message.id) ? prev : [...prev, res.message]));
        scrollDown();
      } else if (res.reason === "banned") {
        setBan({ banned: true, until: res.until, reason: null, strikes: 0 });
        toast.error("أنت محظور مؤقتاً من الدردشة.");
      } else if (res.reason === "flagged") {
        if (res.banned) {
          setBan({ banned: true, until: res.until, reason: "ألفاظ غير لائقة", strikes: 0 });
          toast.error("تم حظرك 3 أيام بسبب تكرار الألفاظ غير اللائقة.");
        } else {
          setBan((b) => (b ? { ...b, strikes: res.strikes } : b));
          toast.warning(
            `رسالتك تحتوي ألفاظاً غير لائقة ولم تُنشر. إنذار ${res.strikes}/3 — عند الوصول إلى 3 يتم الحظر 3 أيام.`,
          );
        }
      }
    } catch {
      toast.error("تعذّر إرسال الرسالة.");
    } finally {
      setBusy(false);
    }
  }

  const banned = ban?.banned;
  const banUntil = ban?.until ? new Date(ban.until).toLocaleString("ar") : null;

  return (
    <div className="mx-auto flex h-[calc(100vh-9rem)] max-w-2xl flex-col">
      <div className="flex items-center justify-between gap-2 pb-3">
        <div className="flex items-center gap-2">
          <div className="flex size-10 items-center justify-center rounded-xl gradient-primary text-primary-foreground shadow-glow">
            <Users className="size-5" />
          </div>
          <div>
            <h1 className="text-lg font-bold">دردشة متعلّمي {langName}</h1>
            <p className="text-xs text-muted-foreground">تحدّث مع من يتعلمون نفس لغتك</p>
          </div>
        </div>
        {ban && !banned && ban.strikes > 0 && (
          <span className="flex items-center gap-1 rounded-full bg-amber-500/15 px-3 py-1 text-xs font-medium text-amber-600">
            <ShieldAlert className="size-3.5" /> إنذارات: {ban.strikes}/3
          </span>
        )}
      </div>

      <div className="flex-1 overflow-y-auto rounded-2xl border bg-card/50 p-3">
        {loading ? (
          <div className="flex h-full items-center justify-center">
            <Loader2 className="size-6 animate-spin text-primary" />
          </div>
        ) : messages.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-center text-muted-foreground">
            <Users className="size-10 opacity-40" />
            <p className="text-sm">لا توجد رسائل بعد. كن أول من يبدأ الحديث بلغة {langName}!</p>
          </div>
        ) : (
          <div className="space-y-3">
            {messages.map((m) => {
              const mine = m.user_id === user?.id;
              return (
                <div key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                  <div
                    className={`max-w-[80%] rounded-2xl px-3.5 py-2 text-sm shadow-soft ${
                      mine ? "gradient-primary text-primary-foreground" : "bg-background border"
                    }`}
                  >
                    {!mine && (
                      <div className="mb-0.5 flex items-center gap-1.5 text-xs font-semibold text-primary">
                        {m.display_name || "متعلّم"}
                        {m.account_number != null && (
                          <span className="rounded bg-primary/10 px-1 text-[10px] font-normal text-primary">
                            #{m.account_number}
                          </span>
                        )}
                      </div>
                    )}
                    <p className="whitespace-pre-wrap break-words leading-relaxed">{m.content}</p>
                    <div className={`mt-0.5 text-[10px] ${mine ? "text-primary-foreground/70" : "text-muted-foreground"}`}>
                      {fmtTime(m.created_at)}
                    </div>
                  </div>
                </div>
              );
            })}
            <div ref={endRef} />
          </div>
        )}
      </div>

      {banned ? (
        <div className="mt-3 flex items-center gap-2 rounded-2xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          <Ban className="size-5 shrink-0" />
          <span>
            تم حظرك من الدردشة بسبب مخالفة قواعد السلوك.
            {banUntil ? ` ينتهي الحظر: ${banUntil}` : ""}
          </span>
        </div>
      ) : (
        <div className="mt-3 flex items-center gap-2">
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && (e.preventDefault(), send())}
            placeholder={`اكتب رسالة بلغة ${langName}...`}
            maxLength={1000}
            disabled={busy}
            className="rounded-xl"
          />
          <Button onClick={send} disabled={busy || !input.trim()} size="icon" className="rounded-xl gradient-primary text-primary-foreground shadow-glow shrink-0">
            {busy ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
          </Button>
        </div>
      )}
      <p className="mt-2 text-center text-[11px] text-muted-foreground">
        يُمنع منعاً باتاً الألفاظ البذيئة والإزعاج — يتم الحظر تلقائياً 3 أيام بعد 3 إنذارات.
      </p>
    </div>
  );
}
