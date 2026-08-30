import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { apiListUnits, apiMyQuizzes, apiParticipantLogin } from "@/lib/quiz.functions";
import {
  clearParticipantSession,
  getDeviceToken,
  getStoredParticipant,
  saveParticipantSession,
  type StoredParticipant,
} from "@/lib/participant-session";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Вхід: підрозділ і позивний | Квіз-система" },
      {
        name: "description",
        content:
          "Увійдіть за підрозділом і позивним, щоб пройти квіз. Сесія прив'язується до вашого пристрою.",
      },
      { property: "og:title", content: "Вхід: підрозділ і позивний | Квіз-система" },
      {
        property: "og:description",
        content: "Увійдіть за підрозділом і позивним, щоб пройти квіз.",
      },
    ],
  }),
  component: ParticipantHome,
});

function ParticipantHome() {
  const [participant, setParticipant] = useState<StoredParticipant | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [unitId, setUnitId] = useState("");
  const [callsign, setCallsign] = useState("");
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const listUnits = useServerFn(apiListUnits);
  const login = useServerFn(apiParticipantLogin);
  const myQuizzes = useServerFn(apiMyQuizzes);

  useEffect(() => {
    setParticipant(getStoredParticipant());
    setToken(getDeviceToken());
  }, []);

  const unitsQuery = useQuery({
    queryKey: ["units"],
    queryFn: () => listUnits(),
  });

  useEffect(() => {
    const first = unitsQuery.data?.units?.[0];
    if (first && !unitId) setUnitId(first.id);
  }, [unitsQuery.data, unitId]);

  const quizzesQuery = useQuery({
    queryKey: ["my-quizzes", token],
    enabled: Boolean(token && participant),
    queryFn: () => myQuizzes({ data: { deviceToken: token! } }),
  });

  const loginMutation = useMutation({
    mutationFn: () =>
      login({ data: { unitId, callsign, deviceToken: getDeviceToken() } }),
    onSuccess: (result) => {
      saveParticipantSession(result.deviceToken, result.session);
      setToken(result.deviceToken);
      setParticipant(result.session);
      queryClient.invalidateQueries({ queryKey: ["my-quizzes"] });
      toast.success(`Вітаємо, ${result.session.callsign}`);
    },
    onError: (error: Error) => toast.error(error.message),
  });

  if (participant && token) {
    const quizzes = quizzesQuery.data?.quizzes ?? [];
    return (
      <div className="min-h-screen bg-background text-foreground">
        <div className="sticky top-0 z-20 border-b border-border bg-background/90 backdrop-blur-sm">
          <div className="mx-auto flex h-14 max-w-[1000px] items-center justify-between px-6">
            <div className="flex items-center gap-3">
              <div className="grid size-7 place-items-center bg-accent font-display text-sm font-bold text-accent-foreground">
                К
              </div>
              <span className="font-display font-semibold tracking-tight">КВІЗ-СИСТЕМА</span>
            </div>
            <div className="flex items-center gap-3 font-mono text-[11px] text-muted-foreground">
              <span>
                {participant.callsign} · {participant.unit_name}
              </span>
              <button
                className="rounded-md border border-border bg-surface px-3 py-1.5 transition-colors hover:text-foreground"
                onClick={() => {
                  clearParticipantSession();
                  setParticipant(null);
                }}
              >
                Вийти
              </button>
            </div>
          </div>
        </div>

        <main className="mx-auto max-w-[1000px] px-6 py-8">
          <p className="mb-2 font-mono text-[11px] uppercase tracking-[0.25em] text-accent">
            Доступні квізи
          </p>
          <h1 className="mb-8 font-display text-3xl font-bold tracking-tight">Оберіть квіз</h1>

          <div className="divide-y divide-border/60 rounded-lg border border-border bg-surface">
            {quizzesQuery.isLoading ? (
              <p className="px-4 py-6 font-mono text-xs text-muted-foreground">Завантаження…</p>
            ) : quizzes.length === 0 ? (
              <p className="px-4 py-6 font-mono text-xs text-muted-foreground">
                Наразі немає активних квізів.
              </p>
            ) : (
              quizzes.map((quiz) => {
                const done = Boolean(quiz.attempt?.end_time);
                return (
                  <div key={quiz.id} className="flex items-center justify-between gap-3 px-4 py-4">
                    <div>
                      <p className="font-display font-semibold leading-tight">{quiz.title}</p>
                      <p className="font-mono text-[11px] text-muted-foreground">
                        {quiz.description ?? "—"}
                      </p>
                    </div>
                    {done ? (
                      <span className="whitespace-nowrap rounded bg-surface-2 px-2 py-1 font-mono text-[11px] text-muted-foreground">
                        Завершено · {quiz.attempt?.score} балів
                      </span>
                    ) : (
                      <button
                        onClick={() => navigate({ to: "/quiz/$quizId", params: { quizId: quiz.id } })}
                        className="whitespace-nowrap rounded-md bg-accent px-3 py-1.5 font-mono text-xs font-medium text-accent-foreground transition-opacity hover:opacity-90"
                      >
                        Почати
                      </button>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-6 text-foreground">
      <div className="w-full max-w-md">
        <div className="mb-6 flex items-center gap-3">
          <div className="grid size-7 place-items-center bg-accent font-display text-sm font-bold text-accent-foreground">
            К
          </div>
          <span className="font-display font-semibold tracking-tight">КВІЗ-СИСТЕМА</span>
          <span className="border-l border-border pl-3 font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
            Брифінг-система
          </span>
        </div>

        <div className="rounded-lg border border-border bg-surface p-6">
          <p className="mb-2 font-mono text-[11px] uppercase tracking-[0.25em] text-accent">
            Крок 01
          </p>
          <h1 className="font-display text-2xl font-bold tracking-tight">
            Вхід: підрозділ і позивний
          </h1>
          <p className="mt-2 font-mono text-[11px] text-muted-foreground">
            Сесія прив'язується до цього пристрою.
          </p>

          <form
            className="mt-6 space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              if (!unitId || !callsign.trim()) {
                toast.error("Оберіть підрозділ і введіть позивний");
                return;
              }
              loginMutation.mutate();
            }}
          >
            <div>
              <label className="mb-1.5 block font-mono text-[10px] uppercase tracking-[0.15em] text-muted-foreground">
                Підрозділ
              </label>
              <select
                value={unitId}
                onChange={(event) => setUnitId(event.target.value)}
                className="w-full rounded-md border border-border bg-surface-2 px-3 py-2.5 text-sm text-foreground outline-none focus:border-accent"
              >
                <option value="">— оберіть —</option>
                {(unitsQuery.data?.units ?? []).map((unit) => (
                  <option key={unit.id} value={unit.id}>
                    {unit.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1.5 block font-mono text-[10px] uppercase tracking-[0.15em] text-muted-foreground">
                Позивний
              </label>
              <input
                value={callsign}
                onChange={(event) => setCallsign(event.target.value)}
                maxLength={40}
                placeholder="ALPHA"
                className="w-full rounded-md border border-border bg-surface-2 px-3 py-2.5 font-mono text-sm text-foreground outline-none focus:border-accent"
              />
            </div>
            <button
              type="submit"
              disabled={loginMutation.isPending}
              className="w-full rounded-md bg-accent py-2.5 font-mono text-sm font-medium text-accent-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
            >
              {loginMutation.isPending ? "Вхід…" : "Увійти"}
            </button>
          </form>
        </div>

        <div className="mt-4 text-center">
          <Link
            to="/auth"
            className="font-mono text-[11px] text-muted-foreground transition-colors hover:text-foreground"
          >
            Вхід для адміністратора →
          </Link>
        </div>
      </div>
    </div>
  );
}
