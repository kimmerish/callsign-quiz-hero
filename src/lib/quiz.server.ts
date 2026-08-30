import type { SupabaseClient } from "@supabase/supabase-js";

export type ParticipantSession = {
  id: string;
  callsign: string;
  unit_id: string;
  unit_name: string;
};

async function admin(): Promise<SupabaseClient> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as unknown as SupabaseClient;
}

export async function listUnits() {
  const db = await admin();
  const { data, error } = await db.from("units").select("id, name").order("name");
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function loginParticipant(input: {
  unitName: string;
  callsign: string;
  deviceToken: string | null;
}) {
  const db = await admin();
  const callsign = input.callsign.trim();
  const unitName = input.unitName.trim();
  if (!callsign) throw new Error("Введіть позивний");
  if (!unitName) throw new Error("Вкажіть підрозділ");

  let { data: unit } = await db
    .from("units")
    .select("id, name")
    .ilike("name", unitName)
    .maybeSingle();

  if (!unit) {
    const { data: created, error } = await db
      .from("units")
      .insert({ name: unitName })
      .select("id, name")
      .single();
    if (error) throw new Error(error.message);
    unit = created;
  }

  const { data: existing } = await db
    .from("participants")
    .select("id, callsign, device_token, unit_id")
    .eq("unit_id", unit!.id)
    .ilike("callsign", callsign)
    .maybeSingle();

  let token = input.deviceToken;
  let participant = existing;

  if (participant) {
    if (participant.device_token && participant.device_token !== token) {
      throw new Error("Цей позивний вже прив'язано до іншого пристрою");
    }
    if (!participant.device_token) {
      token = token ?? crypto.randomUUID();
      const { error } = await db
        .from("participants")
        .update({ device_token: token })
        .eq("id", participant.id);
      if (error) throw new Error(error.message);
    }
  } else {
    token = token ?? crypto.randomUUID();
    const { data: created, error } = await db
      .from("participants")
      .insert({ unit_id: unit!.id, callsign, device_token: token })
      .select("id, callsign, device_token, unit_id")
      .single();
    if (error) throw new Error(error.message);
    participant = created;
  }

  const session: ParticipantSession = {
    id: participant!.id,
    callsign: participant!.callsign,
    unit_id: unit!.id,
    unit_name: unit!.name,
  };
  return { session, deviceToken: token! };
}

export async function requireParticipant(deviceToken: string): Promise<ParticipantSession> {
  const db = await admin();
  const { data, error } = await db
    .from("participants")
    .select("id, callsign, unit_id, units(name)")
    .eq("device_token", deviceToken)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Сесію не знайдено. Увійдіть знову.");
  const unit = data.units as unknown as { name: string } | null;
  return {
    id: data.id,
    callsign: data.callsign,
    unit_id: data.unit_id,
    unit_name: unit?.name ?? "",
  };
}

export async function listPublishedQuizzes(deviceToken: string) {
  const participant = await requireParticipant(deviceToken);
  const db = await admin();
  const { data: quizzes, error } = await db
    .from("quizzes")
    .select("id, title, description")
    .eq("is_published", true)
    .order("created_at");
  if (error) throw new Error(error.message);

  const { data: attempts } = await db
    .from("attempts")
    .select("id, quiz_id, end_time, score")
    .eq("participant_id", participant.id);

  return {
    participant,
    quizzes: (quizzes ?? []).map((q) => {
      const attempt = (attempts ?? []).find((a) => a.quiz_id === q.id) ?? null;
      return { ...q, attempt };
    }),
  };
}

async function signMedia(db: SupabaseClient, path: string | null) {
  if (!path) return null;
  const { data } = await db.storage.from("quiz-media").createSignedUrl(path, 60 * 60);
  return data?.signedUrl ?? null;
}

export async function getQuizForParticipant(deviceToken: string, quizId: string) {
  const participant = await requireParticipant(deviceToken);
  const db = await admin();

  const { data: quiz } = await db
    .from("quizzes")
    .select("id, title, description, is_published")
    .eq("id", quizId)
    .maybeSingle();
  if (!quiz || !quiz.is_published) throw new Error("Квіз недоступний");

  const { data: questions, error } = await db
    .from("questions")
    .select("id, text, media_url, media_type, position, answers(id, text, position)")
    .eq("quiz_id", quizId)
    .order("position");
  if (error) throw new Error(error.message);

  const prepared = [];
  for (const q of questions ?? []) {
    prepared.push({
      id: q.id,
      text: q.text,
      media_type: q.media_type,
      media_url: await signMedia(db, q.media_url),
      answers: ((q.answers ?? []) as { id: string; text: string; position: number }[]).sort(
        (a, b) => a.position - b.position,
      ),
    });
  }

  const { data: attempt } = await db
    .from("attempts")
    .select("id, end_time, score, start_time")
    .eq("participant_id", participant.id)
    .eq("quiz_id", quizId)
    .maybeSingle();

  let responses: { question_id: string; answer_id: string | null }[] = [];
  if (attempt) {
    const { data } = await db
      .from("responses")
      .select("question_id, answer_id")
      .eq("attempt_id", attempt.id);
    responses = data ?? [];
  }

  return { participant, quiz, questions: prepared, attempt, responses };
}

export async function startAttempt(deviceToken: string, quizId: string) {
  const participant = await requireParticipant(deviceToken);
  const db = await admin();

  const { data: existing } = await db
    .from("attempts")
    .select("id, end_time, score")
    .eq("participant_id", participant.id)
    .eq("quiz_id", quizId)
    .maybeSingle();

  if (existing) {
    if (existing.end_time) throw new Error("Ви вже проходили цей квіз");
    return existing;
  }

  const { data, error } = await db
    .from("attempts")
    .insert({ participant_id: participant.id, quiz_id: quizId })
    .select("id, end_time, score")
    .single();
  if (error) throw new Error(error.message);
  return data;
}

async function ownedAttempt(db: SupabaseClient, participantId: string, attemptId: string) {
  const { data } = await db
    .from("attempts")
    .select("id, quiz_id, participant_id, end_time")
    .eq("id", attemptId)
    .maybeSingle();
  if (!data || data.participant_id !== participantId) throw new Error("Спробу не знайдено");
  return data;
}

export async function saveResponse(input: {
  deviceToken: string;
  attemptId: string;
  questionId: string;
  answerId: string;
}) {
  const participant = await requireParticipant(input.deviceToken);
  const db = await admin();
  const attempt = await ownedAttempt(db, participant.id, input.attemptId);
  if (attempt.end_time) throw new Error("Спроба вже завершена");

  const { data: answer } = await db
    .from("answers")
    .select("id, is_correct, question_id")
    .eq("id", input.answerId)
    .maybeSingle();
  if (!answer || answer.question_id !== input.questionId) throw new Error("Невірна відповідь");

  const { error } = await db
    .from("responses")
    .upsert(
      {
        attempt_id: input.attemptId,
        question_id: input.questionId,
        answer_id: input.answerId,
        is_correct: answer.is_correct,
      },
      { onConflict: "attempt_id,question_id" },
    );
  if (error) throw new Error(error.message);
  return { success: true };
}

export async function finishAttempt(deviceToken: string, attemptId: string) {
  const participant = await requireParticipant(deviceToken);
  const db = await admin();
  const attempt = await ownedAttempt(db, participant.id, attemptId);

  const { data: responses } = await db
    .from("responses")
    .select("is_correct")
    .eq("attempt_id", attemptId);
  const score = (responses ?? []).filter((r) => r.is_correct).length;

  const { data, error } = await db
    .from("attempts")
    .update({ end_time: attempt.end_time ?? new Date().toISOString(), score })
    .eq("id", attemptId)
    .select("id, score, end_time")
    .single();
  if (error) throw new Error(error.message);

  const { count } = await db
    .from("questions")
    .select("id", { count: "exact", head: true })
    .eq("quiz_id", attempt.quiz_id);

  return { attempt: data, total: count ?? 0 };
}
