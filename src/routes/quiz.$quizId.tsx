import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  apiFinishAttempt,
  apiGetQuiz,
  apiSaveResponse,
  apiStartAttempt,
} from "@/lib/quiz.functions";
import { getDeviceToken } from "@/lib/participant-session";

export const Route = createFileRoute("/quiz/$quizId")({
  head: () => ({
    meta: [
      { title: "Проходження квізу | Квіз-система" },
      { name: "description", content: "Питання за питанням: оберіть відповідь і рухайтесь далі." },
      { property: "og:title", content: "Проходження квізу | Квіз-система" },
      {
        property: "og:description",
        content: "Питання за питанням: оберіть відповідь і рухайтесь далі.",
      },
    ],
  }),
  component: QuizPage,
});

function QuizPage() {
  const { quizId } = Route.useParams();
  const navigate = useNavigate();
  const [token, setToken] = useState<string | null>(null);
  const [index, setIndex] = useState(0);
  const [selected, setSelected] = useState<Record<string, string>>({});
  const [finished, setFinished] = useState<{ score: number; total: number } | null>(null);

  const getQuiz = useServerFn(apiGetQuiz);
  const startAttempt = useServerFn(apiStartAttempt);
  const saveResponse = useServerFn(apiSaveResponse);
  const finishAttempt = useServerFn(apiFinishAttempt);

  useEffect(() => {
    const stored = getDeviceToken();
    if (!stored) {
      navigate({ to: "/", replace: true });
      return;
    }
    setToken(stored);
  }, [navigate]);

  const quizQuery = useQuery({
    queryKey: ["quiz", quizId, token],
    enabled: Boolean(token),
    queryFn: () => getQuiz({ data: { deviceToken: token!, quizId } }),
  });

  const attemptQuery = useQuery({
    queryKey: ["attempt", quizId, token],
    enabled: Boolean(token) && Boolean(quizQuery.data) && !quizQuery.data?.attempt?.end_time,
    queryFn: () => startAttempt({ data: { deviceToken: token!, quizId } }),
  });

  useEffect(() => {
    const existing = quizQuery.data?.responses ?? [];
    if (existing.length) {
      setSelected((prev) => {
        const next = { ...prev };
        for (const r of existing) if (r.answer_id) next[r.question_id] = r.answer_id;
        return next;
      });
    }
  }, [quizQuery.data]);

  const questions = useMemo(() => quizQuery.data?.questions ?? [], [quizQuery.data]);
  const current = questions[index];
  const attemptId = attemptQuery.data?.attempt?.id;

  const saveMutation = useMutation({
    mutationFn: (input: { questionId: string; answerId: string }) =>
      saveResponse({
        data: {
          deviceToken: token!,
          attemptId: attemptId!,
          questionId: input.questionId,
          answerId: input.answerId,
        },
      }),
    onError: (error: Error) => toast.error(error.message),
  });

  const finishMutation = useMutation({
    mutationFn: () => finishAttempt({ data: { deviceToken: token!, attemptId: attemptId! } }),
    onSuccess: (result) => setFinished({ score: result.attempt.score, total: result.total }),
    onError: (error: Error) => toast.error(error.message),
  });

  if (quizQuery.isLoading || !token) {
    return (
      <div className="grid min-h-screen place-items-center bg-background font-mono text-xs text-muted-foreground">
        Завантаження…
      </div>
    );
  }

  if (quizQuery.isError) {
    return (
      <div className="grid min-h-screen place-items-center bg-background px-6 text-center">
        <div>
          <p className="font-display text-xl font-semibold">
            {(quizQuery.error as Error).message}
          </p>
          <Link
            to="/"
            className="mt-4 inline-block rounded-md bg-accent px-4 py-2 font-mono text-xs font-medium text-accent-foreground"
          >
            До списку квізів
          </Link>
        </div>
      </div>
    );
  }

  const alreadyDone = quizQuery.data?.attempt?.end_time;
  if (finished || alreadyDone) {
    const score = finished?.score ?? quizQuery.data?.attempt?.score ?? 0;
    const total = finished?.total ?? questions.length;
    return (
      <div className="grid min-h-screen place-items-center bg-background px-6">
        <div className="w-full max-w-md rounded-lg border border-border bg-surface p-8 text-center">
          <p className="font-mono text-[11px] uppercase tracking-[0.25em] text-accent">Результат</p>
          <p className="mt-4 font-display text-5xl font-bold">
            {score}
            <span className="text-2xl text-muted-foreground">/{total}</span>
          </p>
          <p className="mt-3 font-mono text-[11px] text-muted-foreground">
            Квіз завершено. Дякуємо за проходження.
          </p>
          <Link
            to="/"
            className="mt-6 inline-block rounded-md bg-accent px-4 py-2 font-mono text-xs font-medium text-accent-foreground"
          >
            До списку квізів
          </Link>
        </div>
      </div>
    );
  }

  if (!current) {
    return (
      <div className="grid min-h-screen place-items-center bg-background font-mono text-xs text-muted-foreground">
        У цьому квізі ще немає запитань.
      </div>
    );
  }

  const chosen = selected[current.id];
  const isLast = index === questions.length - 1;

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="sticky top-0 z-20 border-b border-border bg-background/90 backdrop-blur-sm">
        <div className="mx-auto flex h-14 max-w-[900px] items-center justify-between px-6">
          <span className="font-display font-semibold tracking-tight">
            {quizQuery.data?.quiz.title}
          </span>
          <span className="font-mono text-[11px] text-muted-foreground">
            Питання {index + 1} / {questions.length}
          </span>
        </div>
      </div>

      <main className="mx-auto max-w-[900px] px-6 py-8">
        <div className="mb-6 flex gap-1.5">
          {questions.map((q, i) => (
            <span
              key={q.id}
              className={`h-1 flex-1 rounded-full ${
                i <= index ? "bg-accent" : "bg-surface-2"
              }`}
            />
          ))}
        </div>

        <div className="rounded-lg border border-border bg-surface p-6">
          {current.media_url && current.media_type === "image" ? (
            <img
              src={current.media_url}
              alt={current.text}
              loading="lazy"
              className="mb-6 w-full rounded-md border border-border object-cover"
            />
          ) : null}
          {current.media_url && current.media_type === "video" ? (
            <video
              src={current.media_url}
              controls
              className="mb-6 w-full rounded-md border border-border"
            />
          ) : null}

          <h1 className="font-display text-2xl font-semibold leading-snug">{current.text}</h1>
          <p className="mt-2 font-mono text-[10px] uppercase tracking-[0.15em] text-muted-foreground">
            Оберіть відповідь
          </p>

          <div className="mt-5 space-y-2">
            {current.answers.map((answer, i) => {
              const active = chosen === answer.id;
              return (
                <button
                  key={answer.id}
                  onClick={() => {
                    setSelected((prev) => ({ ...prev, [current.id]: answer.id }));
                    if (attemptId) {
                      saveMutation.mutate({ questionId: current.id, answerId: answer.id });
                    }
                  }}
                  className={`flex w-full items-center gap-3 rounded-md border px-4 py-3 text-left transition-colors ${
                    active
                      ? "border-accent bg-accent-soft"
                      : "border-border bg-surface-2 hover:border-accent/40"
                  }`}
                >
                  <span
                    className={`grid size-6 shrink-0 place-items-center rounded font-mono text-[11px] ${
                      active
                        ? "bg-accent text-accent-foreground"
                        : "bg-background text-muted-foreground"
                    }`}
                  >
                    {String.fromCharCode(65 + i)}
                  </span>
                  <span className="text-sm">{answer.text}</span>
                </button>
              );
            })}
          </div>

          <div className="mt-6 flex items-center justify-between">
            <button
              disabled={index === 0}
              onClick={() => setIndex((i) => Math.max(0, i - 1))}
              className="rounded-md border border-border px-4 py-2 font-mono text-xs text-muted-foreground disabled:opacity-40"
            >
              Назад
            </button>
            {isLast ? (
              <button
                disabled={!chosen || finishMutation.isPending}
                onClick={() => finishMutation.mutate()}
                className="rounded-md bg-accent px-5 py-2 font-mono text-xs font-medium text-accent-foreground disabled:opacity-50"
              >
                Завершити
              </button>
            ) : (
              <button
                disabled={!chosen}
                onClick={() => setIndex((i) => i + 1)}
                className="rounded-md bg-accent px-5 py-2 font-mono text-xs font-medium text-accent-foreground disabled:opacity-50"
              >
                Далі
              </button>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
