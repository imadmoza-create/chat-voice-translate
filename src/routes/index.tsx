import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Mic, Camera, Languages, Volume2, History, Sparkles } from "lucide-react";
import heroImg from "@/assets/hero-translate.jpg";
import appLogo from "@/assets/app-logo.png";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "ترجملي — ترجمة فورية بالنص والصوت والصورة" },
      {
        name: "description",
        content:
          "تطبيق ترجمة ذكي: ترجم بالنص أو الصوت أو الصورة بين أكثر من 16 لغة، استمع للنطق بصوت رجالي أو نسائي، واحفظ سجل ترجماتك.",
      },
      { property: "og:image", content: heroImg },
      { name: "twitter:image", content: heroImg },
    ],
  }),
  component: Landing,
});

const features = [
  { icon: Languages, title: "ترجمة نصية", desc: "ترجمة فورية ودقيقة بين أكثر من 16 لغة." },
  { icon: Mic, title: "إدخال صوتي", desc: "تحدّث وسيتم تحويل كلامك إلى ترجمة مباشرة." },
  { icon: Camera, title: "ترجمة الصور", desc: "صوّر أي نص واحصل على ترجمته فوراً." },
  { icon: Volume2, title: "نطق رجالي ونسائي", desc: "استمع للترجمة بصوت تختاره." },
  { icon: History, title: "حفظ السجل", desc: "كل ترجماتك محفوظة في حسابك." },
  { icon: Sparkles, title: "كشف اللغة تلقائياً", desc: "لا حاجة لتحديد لغة المصدر." },
];

function Landing() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && user) navigate({ to: "/app" });
  }, [user, loading, navigate]);

  return (
    <div className="min-h-screen gradient-subtle">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-5 py-5">
        <span className="flex items-center gap-2 text-2xl font-extrabold text-gradient">
          <img src={appLogo} alt="ترجملي" width={36} height={36} className="size-9 rounded-xl" />
          ترجملي
        </span>
        <Link to="/auth">
          <Button variant="outline" className="rounded-xl">
            تسجيل الدخول
          </Button>
        </Link>
      </header>

      <section className="mx-auto grid max-w-6xl items-center gap-8 px-5 pt-6 pb-16 md:grid-cols-2">
        <div className="text-center md:text-right">
          <span className="inline-flex items-center gap-2 rounded-full bg-secondary px-4 py-1.5 text-sm font-medium text-secondary-foreground">
            <Sparkles className="size-4" /> مدعوم بالذكاء الاصطناعي
          </span>
          <h1 className="mt-5 text-4xl font-extrabold leading-tight md:text-5xl">
            ترجم العالم <span className="text-gradient">بالنص والصوت والصورة</span>
          </h1>
          <p className="mt-4 text-lg text-muted-foreground">
            تطبيق ترجمة مميز يفهم ما تكتب وتقول وتصوّر، وينطق لك النتيجة بصوت رجالي أو نسائي — مع
            حفظ كل ترجماتك.
          </p>
          <div className="mt-7 flex flex-wrap justify-center gap-3 md:justify-start">
            <Link to="/auth">
              <Button
                size="lg"
                className="rounded-xl gradient-primary text-primary-foreground shadow-glow hover:scale-105 transition-transform"
              >
                ابدأ مجاناً
              </Button>
            </Link>
          </div>
        </div>
        <div className="relative">
          <div className="absolute inset-0 -z-10 gradient-hero opacity-20 blur-3xl rounded-full" />
          <img
            src={heroImg}
            alt="رسم توضيحي للترجمة بالنص والصوت والصورة"
            width={1024}
            height={768}
            className="w-full rounded-3xl shadow-glow"
          />
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-5 pb-20">
        <h2 className="mb-8 text-center text-2xl font-bold">كل ما تحتاجه للترجمة في مكان واحد</h2>
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {features.map((f) => (
            <div
              key={f.title}
              className="rounded-2xl border bg-card p-6 shadow-card transition-transform hover:-translate-y-1"
            >
              <div className="flex size-12 items-center justify-center rounded-xl gradient-accent text-accent-foreground">
                <f.icon className="size-6" />
              </div>
              <h3 className="mt-4 text-lg font-bold">{f.title}</h3>
              <p className="mt-1 text-sm text-muted-foreground">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      <footer className="border-t py-6 text-center text-sm text-muted-foreground">
        © {new Date().getFullYear()} ترجملي — جميع الحقوق محفوظة
      </footer>
    </div>
  );
}
