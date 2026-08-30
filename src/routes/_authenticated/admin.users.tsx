import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { AdminShell } from "@/components/AdminShell";
import {
  apiCreateAdmin,
  apiDeleteAdmin,
  apiListAdmins,
  apiResetAdminPassword,
  apiWhoAmI,
} from "@/lib/admin-users.functions";

export const Route = createFileRoute("/_authenticated/admin/users")({
  head: () => ({
    meta: [
      { title: "Адміністратори | Квіз-система" },
      {
        name: "description",
        content: "Головний адміністратор створює акаунти адміністраторів і генерує для них паролі.",
      },
      { property: "og:title", content: "Адміністратори | Квіз-система" },
      { property: "og:description", content: "Керування акаунтами адміністраторів квіз-системи." },
    ],
  }),
  component: AdminUsersPage,
});

function AdminUsersPage() {
  const queryClient = useQueryClient();
  const whoAmI = useServerFn(apiWhoAmI);
  const listAdmins = useServerFn(apiListAdmins);
  const createAdmin = useServerFn(apiCreateAdmin);
  const resetPassword = useServerFn(apiResetAdminPassword);
  const deleteAdmin = useServerFn(apiDeleteAdmin);

  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [credential, setCredential] = useState<{ email: string; password: string } | null>(null);

  const meQuery = useQuery({ queryKey: ["whoami"], queryFn: () => whoAmI() });
  const isSuper = meQuery.data?.isSuperAdmin ?? false;

  const adminsQuery = useQuery({
    queryKey: ["admins"],
    enabled: isSuper,
    queryFn: () => listAdmins(),
  });

  const createMutation = useMutation({
    mutationFn: () => createAdmin({ data: { email, name: name.trim() || null } }),
    onSuccess: (result) => {
      setCredential({ email: result.email, password: result.password });
      setEmail("");
      setName("");
      queryClient.invalidateQueries({ queryKey: ["admins"] });
      toast.success("Адміністратора створено");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const resetMutation = useMutation({
    mutationFn: (vars: { userId: string; email: string }) =>
      resetPassword({ data: { userId: vars.userId } }).then((r) => ({ ...r, email: vars.email })),
    onSuccess: (result) => {
      setCredential({ email: result.email, password: result.password });
      toast.success("Новий пароль згенеровано");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const deleteMutation = useMutation({
    mutationFn: (userId: string) => deleteAdmin({ data: { userId } }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admins"] });
      toast.success("Адміністратора видалено");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  if (meQuery.isLoading) {
    return (
      <AdminShell title="Адміністратори" eyebrow="Доступи">
        <p className="font-mono text-xs text-muted-foreground">Завантаження…</p>
      </AdminShell>
    );
  }

  if (!isSuper) {
    return (
      <AdminShell title="Адміністратори" eyebrow="Доступи">
        <p className="rounded-lg border border-border bg-surface px-4 py-6 font-mono text-xs text-muted-foreground">
          Доступ лише для головного адміністратора.
        </p>
      </AdminShell>
    );
  }

  const admins = adminsQuery.data?.admins ?? [];

  return (
    <AdminShell title="Адміністратори" eyebrow="Доступи">
      <div className="grid gap-6 lg:grid-cols-[360px_1fr]">
        <div className="rounded-lg border border-border bg-surface p-5">
          <h2 className="font-display text-lg font-semibold tracking-tight">Створити адміністратора</h2>
          <form
            className="mt-4 space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              if (!email.trim()) {
                toast.error("Вкажіть пошту");
                return;
              }
              createMutation.mutate();
            }}
          >
            <div>
              <label className="mb-1.5 block font-mono text-[10px] uppercase tracking-[0.15em] text-muted-foreground">
                Пошта
              </label>
              <input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                className="w-full rounded-md border border-border bg-surface-2 px-3 py-2.5 text-sm outline-none focus:border-accent"
              />
            </div>
            <div>
              <label className="mb-1.5 block font-mono text-[10px] uppercase tracking-[0.15em] text-muted-foreground">
                Ім'я (необов'язково)
              </label>
              <input
                value={name}
                onChange={(event) => setName(event.target.value)}
                className="w-full rounded-md border border-border bg-surface-2 px-3 py-2.5 text-sm outline-none focus:border-accent"
              />
            </div>
            <button
              type="submit"
              disabled={createMutation.isPending}
              className="w-full rounded-md bg-accent py-2.5 font-mono text-sm font-medium text-accent-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
            >
              {createMutation.isPending ? "Створення…" : "Створити і згенерувати пароль"}
            </button>
          </form>

          {credential ? (
            <div className="mt-5 rounded-md border border-accent/40 bg-accent-soft p-4">
              <p className="font-mono text-[10px] uppercase tracking-[0.15em] text-accent">
                Збережіть пароль — він показується один раз
              </p>
              <p className="mt-2 break-all font-mono text-xs">{credential.email}</p>
              <p className="mt-1 break-all font-mono text-sm font-semibold">{credential.password}</p>
              <button
                onClick={() => {
                  void navigator.clipboard.writeText(
                    `${credential.email} / ${credential.password}`,
                  );
                  toast.success("Скопійовано");
                }}
                className="mt-3 rounded-md border border-border bg-surface px-3 py-1.5 font-mono text-[11px] text-muted-foreground transition-colors hover:text-foreground"
              >
                Скопіювати
              </button>
            </div>
          ) : null}
        </div>

        <div className="divide-y divide-border/60 rounded-lg border border-border bg-surface">
          {adminsQuery.isLoading ? (
            <p className="px-4 py-6 font-mono text-xs text-muted-foreground">Завантаження…</p>
          ) : admins.length === 0 ? (
            <p className="px-4 py-6 font-mono text-xs text-muted-foreground">Немає акаунтів.</p>
          ) : (
            admins.map((account) => {
              const isMain = account.roles.includes("superadmin");
              return (
                <div
                  key={account.id}
                  className="flex flex-wrap items-center justify-between gap-3 px-4 py-4"
                >
                  <div>
                    <p className="font-display font-semibold leading-tight">
                      {account.name || account.email}
                    </p>
                    <p className="font-mono text-[11px] text-muted-foreground">
                      {account.email} ·{" "}
                      {isMain ? "головний адміністратор" : "адміністратор"}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 font-mono text-[11px]">
                    {!isMain ? (
                      <>
                        <button
                          onClick={() =>
                            resetMutation.mutate({ userId: account.id, email: account.email })
                          }
                          className="rounded-md border border-border bg-surface-2 px-3 py-1.5 text-muted-foreground transition-colors hover:text-foreground"
                        >
                          Новий пароль
                        </button>
                        <button
                          onClick={() => deleteMutation.mutate(account.id)}
                          className="rounded-md border border-border bg-surface-2 px-3 py-1.5 text-muted-foreground transition-colors hover:text-destructive"
                        >
                          Видалити
                        </button>
                      </>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </AdminShell>
  );
}
