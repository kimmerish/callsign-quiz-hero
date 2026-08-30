import { Link, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";

const NAV = [
  { to: "/admin", label: "Підсумки" },
  { to: "/admin/quizzes", label: "Квізи" },
  { to: "/admin/units", label: "Підрозділи" },
  { to: "/admin/users", label: "Адміністратори" },
] as const;

export function AdminShell({
  title,
  eyebrow,
  actions,
  children,
}: {
  title: string;
  eyebrow?: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  async function signOut() {
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="sticky top-0 z-20 border-b border-border bg-background/90 backdrop-blur-sm">
        <div className="mx-auto flex h-14 max-w-[1440px] items-center justify-between px-6">
          <div className="flex items-center gap-3">
            <div className="grid size-7 place-items-center bg-accent font-display text-sm font-bold text-accent-foreground">
              К
            </div>
            <span className="font-display font-semibold tracking-tight">КВІЗ-СИСТЕМА</span>
            <span className="border-l border-border pl-3 font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
              Панель адміністратора
            </span>
          </div>
          <div className="hidden items-center gap-1 font-mono text-xs md:flex">
            {NAV.map((item) => (
              <Link
                key={item.to}
                to={item.to}
                activeOptions={{ exact: item.to === "/admin" }}
                activeProps={{ className: "bg-accent-soft text-accent font-medium" }}
                inactiveProps={{ className: "text-muted-foreground hover:text-foreground" }}
                className="rounded-md px-3 py-2 transition-colors"
              >
                {item.label}
              </Link>
            ))}
          </div>
          <button
            onClick={signOut}
            className="rounded-md border border-border bg-surface px-3 py-2 font-mono text-xs text-muted-foreground transition-colors hover:text-foreground"
          >
            Вийти
          </button>
        </div>
      </div>

      <main className="mx-auto max-w-[1440px] px-6 py-8">
        <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
          <div>
            {eyebrow ? (
              <p className="mb-2 font-mono text-[11px] uppercase tracking-[0.25em] text-accent">
                {eyebrow}
              </p>
            ) : null}
            <h1 className="text-balance font-display text-3xl font-bold tracking-tight md:text-4xl">
              {title}
            </h1>
          </div>
          {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
        </div>
        {children}
      </main>
    </div>
  );
}
