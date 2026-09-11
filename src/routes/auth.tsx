import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable/index";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [{ title: "تسجيل الدخول — ترجملي" }],
  }),
  component: AuthPage,
});

function AuthPage() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!loading && user) navigate({ to: "/app" });
  }, [user, loading, navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      if (mode === "signup") {
        if (!/^\+?[0-9\s-]{6,20}$/.test(phone.trim())) {
          toast.error("أدخل رقم هاتف صحيحاً — رقم الهاتف أساسي للحساب.");
          setBusy(false);
          return;
        }
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: window.location.origin,
            data: { display_name: name, phone: phone.trim() },
          },
        });
        if (error) throw error;
        toast.success("تم إنشاء الحساب بنجاح!");
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        toast.success("مرحباً بعودتك!");
      }
      navigate({ to: "/app" });
    } catch (err: any) {
      toast.error(err?.message ?? "حدث خطأ، حاول مجدداً");
    } finally {
      setBusy(false);
    }
  };

  const handleGoogle = async () => {
    setBusy(true);
    try {
      const result = await lovable.auth.signInWithOAuth("google", {
        redirect_uri: window.location.origin,
      });
      if (result.error) {
        toast.error("تعذّر تسجيل الدخول عبر جوجل");
        setBusy(false);
        return;
      }
      if (result.redirected) return;
      navigate({ to: "/app" });
    } catch {
      toast.error("تعذّر تسجيل الدخول عبر جوجل");
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center gradient-subtle px-5 py-10">
      <div className="w-full max-w-md rounded-3xl border bg-card p-8 shadow-soft">
        <Link to="/" className="block text-center text-2xl font-extrabold text-gradient">
          ترجملي
        </Link>
        <h1 className="mt-4 text-center text-xl font-bold">
          {mode === "login" ? "تسجيل الدخول" : "إنشاء حساب جديد"}
        </h1>
        <p className="mt-1 text-center text-sm text-muted-foreground">
          {mode === "login" ? "أدخل بريدك للمتابعة" : "ابدأ رحلتك مع الترجمة الذكية"}
        </p>

        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          {mode === "signup" && (
            <>
              <div className="space-y-1.5">
                <Label htmlFor="name">الاسم</Label>
                <Input
                  id="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="اسمك"
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="phone">رقم الهاتف (أساسي للحساب)</Label>
                <Input
                  id="phone"
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="+9665xxxxxxxx"
                  required
                />
              </div>
            </>
          )}
          <div className="space-y-1.5">
            <Label htmlFor="email">البريد الإلكتروني</Label>
            <Input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              required
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="password">كلمة المرور</Label>
            <Input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              minLength={6}
              required
            />
          </div>
          <Button
            type="submit"
            disabled={busy}
            className="w-full rounded-xl gradient-primary text-primary-foreground shadow-glow"
          >
            {busy ? (
              <Loader2 className="size-4 animate-spin" />
            ) : mode === "login" ? (
              "دخول"
            ) : (
              "إنشاء الحساب"
            )}
          </Button>
        </form>

        <div className="my-5 flex items-center gap-3 text-xs text-muted-foreground">
          <span className="h-px flex-1 bg-border" /> أو <span className="h-px flex-1 bg-border" />
        </div>

        <Button
          variant="outline"
          onClick={handleGoogle}
          disabled={busy}
          className="w-full rounded-xl"
        >
          المتابعة عبر جوجل
        </Button>

        <p className="mt-6 text-center text-sm text-muted-foreground">
          {mode === "login" ? "ليس لديك حساب؟" : "لديك حساب بالفعل؟"}{" "}
          <button
            type="button"
            onClick={() => setMode(mode === "login" ? "signup" : "login")}
            className="font-semibold text-primary hover:underline"
          >
            {mode === "login" ? "أنشئ حساباً" : "سجّل الدخول"}
          </button>
        </p>
      </div>
    </div>
  );
}
