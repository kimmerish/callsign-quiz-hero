import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { AdminShell } from "@/components/AdminShell";
import { supabase } from "@/integrations/supabase/client";
import { DEFAULT_BRANDING, type Branding } from "@/lib/branding";

export const Route = createFileRoute("/_authenticated/admin/appearance")({
  head: () => ({
    meta: [
      { title: "Зовнішній вигляд | Панель адміністратора" },
      { name: "description", content: "Налаштування кольорів, логотипу та назви системи." },
      { property: "og:title", content: "Зовнішній вигляд | Панель адміністратора" },
      {
        property: "og:description",
        content: "Налаштування кольорів, логотипу та назви системи.",
      },
    ],
  }),
  component: AppearancePage,
});

const COLOR_FIELDS = [
  { key: "color_background", label: "Фон" },
  { key: "color_surface", label: "Панелі" },
  { key: "color_surface_2", label: "Панелі (2 рівень)" },
  { key: "color_foreground", label: "Текст" },
  { key: "color_accent", label: "Акцент" },
] as const;

function hslToHex(value: string): string {
  const match = value.match(/(-?[\d.]+)\s+(-?[\d.]+)%\s+(-?[\d.]+)%/);
  if (!match) return "#000000";
  const h = Number(match[1]) / 360;
  const s = Number(match[2]) / 100;
  const l = Number(match[3]) / 100;
  const k = (n: number) => (n + h * 12) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  const to = (n: number) =>
    Math.round(255 * f(n))
      .toString(16)
      .padStart(2, "0");
  return `#${to(0)}${to(8)}${to(4)}`;
}

function hexToHsl(hex: string): string {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  let h = 0;
  let s = 0;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) * 60;
    else if (max === g) h = ((b - r) / d + 2) * 60;
    else h = ((r - g) / d + 4) * 60;
  }
  return `${Math.round(h)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%`;
}

function AppearancePage() {
  const queryClient = useQueryClient();
  const [form, setForm] = useState<Branding>(DEFAULT_BRANDING);

  const settingsQuery = useQuery({
    queryKey: ["app-settings-admin"],
    queryFn: async () => {
      const { data, error } = await supabase.from("app_settings").select("*").maybeSingle();
      if (error) throw new Error(error.message);
      return data;
    },
  });

  useEffect(() => {
    if (settingsQuery.data) {
      setForm({ ...DEFAULT_BRANDING, ...settingsQuery.data } as Branding);
    }
  }, [settingsQuery.data]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("app_settings")
        .upsert({ id: true, ...form }, { onConflict: "id" });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      toast.success("Збережено");
      queryClient.invalidateQueries({ queryKey: ["app-settings"] });
      queryClient.invalidateQueries({ queryKey: ["app-settings-admin"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  function onLogoFile(file: File) {
    if (file.size > 300 * 1024) {
      toast.error("Логотип має бути до 300 КБ");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setForm((prev) => ({ ...prev, logo_url: String(reader.result) }));
    reader.readAsDataURL(file);
  }

  return (
    <AdminShell title="Зовнішній вигляд" eyebrow="Брендування">
      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="rounded-lg border border-border bg-surface p-6">
          <label className="mb-1.5 block font-mono text-[10px] uppercase tracking-[0.15em] text-muted-foreground">
            Назва системи
          </label>
          <input
            value={form.system_name}
            onChange={(event) => setForm((p) => ({ ...p, system_name: event.target.value }))}
            maxLength={60}
            className="w-full rounded-md border border-border bg-surface-2 px-3 py-2.5 text-sm outline-none focus:border-accent"
          />

          <label className="mb-1.5 mt-6 block font-mono text-[10px] uppercase tracking-[0.15em] text-muted-foreground">
            Логотип (PNG/SVG до 300 КБ)
          </label>
          <div className="flex items-center gap-3">
            {form.logo_url ? (
              <img
                src={form.logo_url}
                alt="Логотип"
                className="size-12 rounded border border-border object-contain"
              />
            ) : null}
            <input
              type="file"
              accept="image/*"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) onLogoFile(file);
              }}
              className="font-mono text-xs text-muted-foreground"
            />
            {form.logo_url ? (
              <button
                onClick={() => setForm((p) => ({ ...p, logo_url: null }))}
                className="rounded-md border border-border px-3 py-1.5 font-mono text-xs text-muted-foreground"
              >
                Прибрати
              </button>
            ) : null}
          </div>

          <div className="mt-6 space-y-3">
            {COLOR_FIELDS.map((field) => (
              <div key={field.key} className="flex items-center gap-3">
                <input
                  type="color"
                  value={hslToHex(form[field.key])}
                  onChange={(event) =>
                    setForm((p) => ({ ...p, [field.key]: hexToHsl(event.target.value) }))
                  }
                  className="size-9 cursor-pointer rounded border border-border bg-surface-2"
                />
                <span className="w-40 font-mono text-xs text-muted-foreground">{field.label}</span>
                <input
                  value={form[field.key]}
                  onChange={(event) => setForm((p) => ({ ...p, [field.key]: event.target.value }))}
                  className="flex-1 rounded-md border border-border bg-surface-2 px-3 py-2 font-mono text-xs outline-none focus:border-accent"
                />
              </div>
            ))}
          </div>

          <div className="mt-6 flex gap-2">
            <button
              onClick={() => saveMutation.mutate()}
              disabled={saveMutation.isPending}
              className="rounded-md bg-accent px-4 py-2 font-mono text-xs font-medium text-accent-foreground disabled:opacity-60"
            >
              {saveMutation.isPending ? "Збереження…" : "Зберегти"}
            </button>
            <button
              onClick={() => setForm((p) => ({ ...DEFAULT_BRANDING, logo_url: p.logo_url }))}
              className="rounded-md border border-border px-4 py-2 font-mono text-xs text-muted-foreground"
            >
              Скинути кольори
            </button>
          </div>
        </div>

        <div
          className="rounded-lg border border-border p-5"
          style={{
            background: `hsl(${form.color_background})`,
            color: `hsl(${form.color_foreground})`,
          }}
        >
          <p className="font-mono text-[10px] uppercase tracking-[0.2em] opacity-60">Попередній перегляд</p>
          <div className="mt-4 flex items-center gap-3">
            {form.logo_url ? (
              <img src={form.logo_url} alt="Логотип" className="size-7 object-contain" />
            ) : (
              <div
                className="grid size-7 place-items-center font-display text-sm font-bold"
                style={{
                  background: `hsl(${form.color_accent})`,
                  color: `hsl(${form.color_background})`,
                }}
              >
                {form.system_name.charAt(0).toUpperCase()}
              </div>
            )}
            <span className="font-display font-semibold">{form.system_name}</span>
          </div>
          <div
            className="mt-4 rounded-md p-4"
            style={{ background: `hsl(${form.color_surface})` }}
          >
            <p className="font-display text-sm font-semibold">Приклад питання</p>
            <div
              className="mt-3 rounded-md px-3 py-2 text-xs"
              style={{ background: `hsl(${form.color_surface_2})` }}
            >
              Варіант відповіді
            </div>
            <button
              className="mt-3 rounded-md px-3 py-2 font-mono text-xs font-medium"
              style={{
                background: `hsl(${form.color_accent})`,
                color: `hsl(${form.color_background})`,
              }}
            >
              Розпочати
            </button>
          </div>
        </div>
      </div>
    </AdminShell>
  );
}
