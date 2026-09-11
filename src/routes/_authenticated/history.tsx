import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { speak, type VoiceGender } from "@/lib/speech";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Volume2, Copy, Star, Trash2, Loader2, History as HistoryIcon } from "lucide-react";

export const Route = createFileRoute("/_authenticated/history")({
  head: () => ({ meta: [{ title: "سجل الترجمات — ترجملي" }] }),
  component: HistoryPage,
});

type Row = {
  id: string;
  source_text: string;
  translated_text: string;
  source_lang: string | null;
  target_lang: string;
  mode: string;
  is_favorite: boolean;
  created_at: string;
};

function HistoryPage() {
  const { user } = useAuth();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "fav">("all");

  const load = async () => {
    if (!user) return;
    setLoading(true);
    let q = supabase
      .from("translations")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(200);
    if (filter === "fav") q = q.eq("is_favorite", true);
    const { data } = await q;
    setRows((data as Row[]) ?? []);
    setLoading(false);
  };

  useEffect(() => {
    load(); /* eslint-disable-next-line */
  }, [user, filter]);

  const toggleFav = async (r: Row) => {
    await supabase.from("translations").update({ is_favorite: !r.is_favorite }).eq("id", r.id);
    load();
  };

  const remove = async (id: string) => {
    await supabase.from("translations").delete().eq("id", id);
    setRows((p) => p.filter((r) => r.id !== id));
    toast.success("تم الحذف");
  };

  const copy = (t: string) => {
    navigator.clipboard.writeText(t);
    toast.success("تم النسخ");
  };

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="size-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">سجل الترجمات</h1>
        <div className="flex items-center gap-1 rounded-xl bg-muted p-1">
          <button
            onClick={() => setFilter("all")}
            className={`rounded-lg px-3 py-1 text-sm font-medium ${filter === "all" ? "bg-card shadow-sm" : "text-muted-foreground"}`}
          >
            الكل
          </button>
          <button
            onClick={() => setFilter("fav")}
            className={`rounded-lg px-3 py-1 text-sm font-medium ${filter === "fav" ? "bg-card shadow-sm" : "text-muted-foreground"}`}
          >
            المفضلة
          </button>
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed bg-card py-16 text-center">
          <HistoryIcon className="size-10 text-muted-foreground" />
          <p className="text-muted-foreground">لا توجد ترجمات بعد</p>
        </div>
      ) : (
        <div className="space-y-3">
          {rows.map((r) => (
            <div key={r.id} className="rounded-2xl border bg-card p-4 shadow-card">
              <div className="mb-1 flex items-center justify-between text-xs text-muted-foreground">
                <span>
                  {r.source_lang || "?"} ← {r.target_lang}
                </span>
                <span>{new Date(r.created_at).toLocaleDateString("ar")}</span>
              </div>
              <p className="text-sm text-muted-foreground line-clamp-2">{r.source_text}</p>
              <p className="mt-1 font-semibold">{r.translated_text}</p>
              <div className="mt-3 flex gap-1">
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-8 rounded-lg"
                  onClick={() => speak(r.translated_text, "en-US", "female" as VoiceGender)}
                >
                  <Volume2 className="size-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-8 rounded-lg"
                  onClick={() => copy(r.translated_text)}
                >
                  <Copy className="size-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-8 rounded-lg"
                  onClick={() => toggleFav(r)}
                >
                  <Star className={`size-4 ${r.is_favorite ? "fill-accent text-accent" : ""}`} />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-8 rounded-lg text-destructive"
                  onClick={() => remove(r.id)}
                >
                  <Trash2 className="size-4" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
