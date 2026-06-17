import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { speak, type VoiceGender } from "@/lib/speech";
import { WORD_CATEGORIES, PRONOUNS, type LearnItem } from "@/lib/learn";
import { Button } from "@/components/ui/button";
import { Volume2, GraduationCap, Loader2 } from "lucide-react";

export const Route = createFileRoute("/_authenticated/learn")({
  head: () => ({ meta: [{ title: "تعلّم الكلمات والضمائر — ترجملي" }] }),
  component: LearnPage,
});

type Tab = "words" | "pronouns" | "mine";

function LearnCard({ item, gender }: { item: LearnItem; gender: VoiceGender }) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-2xl border bg-card p-4 text-center shadow-card transition-transform hover:-translate-y-1">
      <div className="text-4xl leading-none">{item.emoji}</div>
      <div className="font-bold">{item.ar}</div>
      <div className="text-sm text-muted-foreground" dir="ltr">{item.en}</div>
      <Button
        variant="secondary"
        size="sm"
        className="mt-1 rounded-xl gap-1.5"
        onClick={() => speak(item.en, "en-US", gender)}
      >
        <Volume2 className="size-4" /> استمع
      </Button>
    </div>
  );
}

function LearnPage() {
  const { user } = useAuth();
  const [tab, setTab] = useState<Tab>("words");
  const [gender, setGender] = useState<VoiceGender>("female");
  const [activeCat, setActiveCat] = useState(WORD_CATEGORIES[0].id);
  const [mine, setMine] = useState<LearnItem[]>([]);
  const [loadingMine, setLoadingMine] = useState(false);

  useEffect(() => {
    if (tab !== "mine" || !user) return;
    setLoadingMine(true);
    supabase
      .from("translations")
      .select("source_text, translated_text")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(60)
      .then(({ data }) => {
        const seen = new Set<string>();
        const items: LearnItem[] = [];
        for (const r of data ?? []) {
          const en = (r.translated_text || "").trim();
          if (!en || en.split(/\s+/).length > 3 || seen.has(en.toLowerCase())) continue;
          seen.add(en.toLowerCase());
          items.push({ emoji: "📝", ar: (r.source_text || "").trim(), en });
        }
        setMine(items);
        setLoadingMine(false);
      });
  }, [tab, user]);

  const cat = WORD_CATEGORIES.find((c) => c.id === activeCat)!;

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-2">
        <GraduationCap className="size-6 text-primary" />
        <h1 className="text-2xl font-bold">تعلّم</h1>
      </div>

      <div className="flex items-center gap-1 rounded-xl bg-muted p-1 text-sm font-medium">
        <button onClick={() => setTab("words")} className={`flex-1 rounded-lg px-3 py-1.5 ${tab === "words" ? "bg-card shadow-sm" : "text-muted-foreground"}`}>الكلمات</button>
        <button onClick={() => setTab("pronouns")} className={`flex-1 rounded-lg px-3 py-1.5 ${tab === "pronouns" ? "bg-card shadow-sm" : "text-muted-foreground"}`}>الضمائر</button>
        <button onClick={() => setTab("mine")} className={`flex-1 rounded-lg px-3 py-1.5 ${tab === "mine" ? "bg-card shadow-sm" : "text-muted-foreground"}`}>من سجلي</button>
      </div>

      <div className="flex items-center justify-end gap-2 text-sm">
        <span className="text-muted-foreground">صوت النطق:</span>
        <div className="flex items-center gap-1 rounded-xl bg-muted p-1">
          <button onClick={() => setGender("female")} className={`rounded-lg px-3 py-1 ${gender === "female" ? "bg-card shadow-sm" : "text-muted-foreground"}`}>مؤنث</button>
          <button onClick={() => setGender("male")} className={`rounded-lg px-3 py-1 ${gender === "male" ? "bg-card shadow-sm" : "text-muted-foreground"}`}>مذكر</button>
        </div>
      </div>

      {tab === "words" && (
        <>
          <div className="flex flex-wrap gap-2">
            {WORD_CATEGORIES.map((c) => (
              <button
                key={c.id}
                onClick={() => setActiveCat(c.id)}
                className={`rounded-xl border px-3 py-1.5 text-sm font-medium ${activeCat === c.id ? "gradient-primary text-primary-foreground" : "bg-card text-muted-foreground"}`}
              >
                {c.emoji} {c.title}
              </button>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {cat.items.map((it) => (
              <LearnCard key={it.en} item={it} gender={gender} />
            ))}
          </div>
        </>
      )}

      {tab === "pronouns" && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {PRONOUNS.map((it) => (
            <LearnCard key={it.en + it.ar} item={it} gender={gender} />
          ))}
        </div>
      )}

      {tab === "mine" && (
        loadingMine ? (
          <div className="flex justify-center py-16"><Loader2 className="size-8 animate-spin text-primary" /></div>
        ) : mine.length === 0 ? (
          <div className="rounded-2xl border border-dashed bg-card py-16 text-center text-muted-foreground">
            لا توجد كلمات بعد — ابدأ بالترجمة وستظهر هنا للمراجعة.
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {mine.map((it, i) => (
              <LearnCard key={it.en + i} item={it} gender={gender} />
            ))}
          </div>
        )
      )}
    </div>
  );
}
