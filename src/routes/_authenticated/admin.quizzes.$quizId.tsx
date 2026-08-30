import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { AdminShell } from "@/components/AdminShell";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/admin/quizzes/$quizId")({
  head: () => ({
    meta: [
      { title: "Редактор запитань | Панель адміністратора" },
      { name: "description", content: "Додавання запитань, відповідей та медіа до квізу." },
      { property: "og:title", content: "Редактор запитань | Панель адміністратора" },
      { property: "og:description", content: "Додавання запитань, відповідей та медіа до квізу." },
    ],
  }),
  component: QuestionEditor,
});

type AnswerDraft = { text: string; is_correct: boolean };

function QuestionEditor() {
  const { quizId } = Route.useParams();
  const queryClient = useQueryClient();
  const [text, setText] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [answers, setAnswers] = useState<AnswerDraft[]>([
    { text: "", is_correct: true },
    { text: "", is_correct: false },
  ]);

  const quizQuery = useQuery({
    queryKey: ["admin-quiz", quizId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("quizzes")
        .select("id, title, description")
        .eq("id", quizId)
        .single();
      if (error) throw error;
      return data;
    },
  });

  const questionsQuery = useQuery({
    queryKey: ["admin-questions", quizId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("questions")
        .select("id, text, position, media_type, media_url, answers(id, text, is_correct, position)")
        .eq("quiz_id", quizId)
        .order("position");
      if (error) throw error;
      return data;
    },
  });

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: ["admin-questions", quizId] });

  const addMutation = useMutation({
    mutationFn: async () => {
      let mediaUrl: string | null = null;
      let mediaType: string | null = null;
      if (file) {
        const path = `${quizId}/${crypto.randomUUID()}-${file.name}`;
        const { error: uploadError } = await supabase.storage
          .from("quiz-media")
          .upload(path, file);
        if (uploadError) throw uploadError;
        mediaUrl = path;
        mediaType = file.type.startsWith("video") ? "video" : "image";
      }

      const position = (questionsQuery.data?.length ?? 0) + 1;
      const { data: question, error } = await supabase
        .from("questions")
        .insert({ quiz_id: quizId, text: text.trim(), position, media_url: mediaUrl, media_type: mediaType })
        .select("id")
        .single();
      if (error) throw error;

      const rows = answers
        .filter((a) => a.text.trim())
        .map((a, i) => ({
          question_id: question.id,
          text: a.text.trim(),
          is_correct: a.is_correct,
          position: i + 1,
        }));
      if (rows.length) {
        const { error: answerError } = await supabase.from("answers").insert(rows);
        if (answerError) throw answerError;
      }
    },
    onSuccess: () => {
      setText("");
      setFile(null);
      setAnswers([
        { text: "", is_correct: true },
        { text: "", is_correct: false },
      ]);
      toast.success("Запитання додано");
      invalidate();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("questions").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Запитання видалено");
      invalidate();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <AdminShell title={quizQuery.data?.title ?? "Квіз"} eyebrow="Редактор запитань">
      <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
        <div className="space-y-3">
          {(questionsQuery.data ?? []).map((question, index) => (
            <div key={question.id} className="rounded-lg border border-border bg-surface p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-mono text-[10px] uppercase tracking-[0.15em] text-muted-foreground">
                    Запитання {index + 1}
                    {question.media_type ? ` · ${question.media_type}` : ""}
                  </p>
                  <p className="mt-1 font-display font-semibold">{question.text}</p>
                </div>
                <button
                  onClick={() => deleteMutation.mutate(question.id)}
                  className="rounded-md border border-border px-3 py-1.5 font-mono text-[11px] text-destructive"
                >
                  Видалити
                </button>
              </div>
              <ul className="mt-3 space-y-1.5">
                {[...(question.answers ?? [])]
                  .sort((a, b) => a.position - b.position)
                  .map((answer) => (
                    <li
                      key={answer.id}
                      className={`rounded-md px-3 py-2 text-sm ${
                        answer.is_correct
                          ? "bg-accent-soft text-accent"
                          : "bg-surface-2 text-muted-foreground"
                      }`}
                    >
                      {answer.text}
                    </li>
                  ))}
              </ul>
            </div>
          ))}
          {questionsQuery.data?.length === 0 ? (
            <p className="rounded-lg border border-border bg-surface px-4 py-6 font-mono text-xs text-muted-foreground">
              Запитань ще немає.
            </p>
          ) : null}
        </div>

        <form
          className="h-fit rounded-lg border border-border bg-surface p-4"
          onSubmit={(event) => {
            event.preventDefault();
            if (!text.trim()) { toast.error("Введіть текст запитання"); return; }
            if (!answers.some((a) => a.is_correct && a.text.trim()))
              { toast.error("Позначте правильну відповідь"); return; }
            addMutation.mutate();
          }}
        >
          <p className="mb-4 font-mono text-[11px] uppercase tracking-[0.15em] text-accent">
            Додати запитання
          </p>
          <label className="mb-1.5 block font-mono text-[10px] uppercase tracking-[0.15em] text-muted-foreground">
            Текст запитання
          </label>
          <textarea
            value={text}
            rows={3}
            maxLength={500}
            onChange={(e) => setText(e.target.value)}
            className="mb-3 w-full rounded-md border border-border bg-surface-2 px-3 py-2 text-sm outline-none focus:border-accent"
          />

          <label className="mb-1.5 block font-mono text-[10px] uppercase tracking-[0.15em] text-muted-foreground">
            Зображення або відео
          </label>
          <input
            type="file"
            accept="image/*,video/*"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            className="mb-4 w-full font-mono text-[11px] text-muted-foreground"
          />

          <p className="mb-2 font-mono text-[10px] uppercase tracking-[0.15em] text-muted-foreground">
            Варіанти відповідей
          </p>
          <div className="space-y-2">
            {answers.map((answer, index) => (
              <div key={index} className="flex items-center gap-2">
                <input
                  type="radio"
                  name="correct"
                  checked={answer.is_correct}
                  onChange={() =>
                    setAnswers((prev) => prev.map((a, i) => ({ ...a, is_correct: i === index })))
                  }
                  className="accent-[hsl(38_78%_55%)]"
                />
                <input
                  value={answer.text}
                  maxLength={240}
                  placeholder={`Варіант ${index + 1}`}
                  onChange={(e) =>
                    setAnswers((prev) =>
                      prev.map((a, i) => (i === index ? { ...a, text: e.target.value } : a)),
                    )
                  }
                  className="flex-1 rounded-md border border-border bg-surface-2 px-3 py-2 text-sm outline-none focus:border-accent"
                />
              </div>
            ))}
          </div>
          <button
            type="button"
            onClick={() => setAnswers((prev) => [...prev, { text: "", is_correct: false }])}
            className="mt-2 w-full rounded-md border border-border py-2 font-mono text-[11px] text-muted-foreground hover:text-foreground"
          >
            + Ще варіант
          </button>

          <button
            type="submit"
            disabled={addMutation.isPending}
            className="mt-4 w-full rounded-md bg-accent py-2 font-mono text-xs font-medium text-accent-foreground disabled:opacity-60"
          >
            {addMutation.isPending ? "Збереження…" : "Додати запитання"}
          </button>
        </form>
      </div>
    </AdminShell>
  );
}
