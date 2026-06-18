import { createFileRoute, Outlet, useNavigate, useRouterState, Link } from "@tanstack/react-router";
import { useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import appLogo from "@/assets/app-logo.png";
import { Languages, History, LogOut, Loader2, GraduationCap, Bot } from "lucide-react";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  component: AuthenticatedLayout,
});

function AuthenticatedLayout() {
  const { user, loading, signOut } = useAuth();
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  useEffect(() => {
    if (!loading && !user) navigate({ to: "/auth" });
  }, [user, loading, navigate]);

  if (loading || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="size-8 animate-spin text-primary" />
      </div>
    );
  }

  const handleSignOut = async () => {
    await signOut();
    navigate({ to: "/" });
  };

  return (
    <div className="min-h-screen gradient-subtle">
      <header className="sticky top-0 z-20 border-b bg-background/80 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-3">
          <Link to="/app" className="flex items-center gap-2 text-xl font-extrabold text-gradient">
            <img src={appLogo} alt="ترجملي" width={32} height={32} className="size-8 rounded-lg" />
            ترجملي
          </Link>
          <nav className="flex items-center gap-1">
            <Link to="/app">
              <Button variant={pathname === "/app" ? "secondary" : "ghost"} size="sm" className="rounded-xl gap-1.5">
                <Languages className="size-4" /> الترجمة
              </Button>
            </Link>
            <Link to="/learn">
              <Button variant={pathname === "/learn" ? "secondary" : "ghost"} size="sm" className="rounded-xl gap-1.5">
                <GraduationCap className="size-4" /> تعلّم
              </Button>
            </Link>
            <Link to="/history">
              <Button variant={pathname === "/history" ? "secondary" : "ghost"} size="sm" className="rounded-xl gap-1.5">
                <History className="size-4" /> السجل
              </Button>
            </Link>
            <Button variant="ghost" size="icon" className="rounded-xl" onClick={handleSignOut} title="تسجيل الخروج">
              <LogOut className="size-4" />
            </Button>
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-4 py-6">
        <Outlet />
      </main>
    </div>
  );
}
