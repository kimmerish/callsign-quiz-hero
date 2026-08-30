import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

export const apiListUnits = createServerFn({ method: "GET" }).handler(async () => {
  const { listUnits } = await import("./quiz.server");
  return { success: true as const, units: await listUnits() };
});

export const apiParticipantLogin = createServerFn({ method: "POST" })
  .inputValidator((input) =>
    z
      .object({
        unitName: z.string().trim().min(1).max(80),
        callsign: z.string().trim().min(1).max(40),
        deviceToken: z.string().uuid().nullable().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const { loginParticipant } = await import("./quiz.server");
    const result = await loginParticipant({
      unitName: data.unitName,
      callsign: data.callsign,
      deviceToken: data.deviceToken ?? null,
    });
    return { success: true as const, ...result };
  });

export const apiMyQuizzes = createServerFn({ method: "POST" })
  .inputValidator((input) => z.object({ deviceToken: z.string().uuid() }).parse(input))
  .handler(async ({ data }) => {
    const { listPublishedQuizzes } = await import("./quiz.server");
    return { success: true as const, ...(await listPublishedQuizzes(data.deviceToken)) };
  });

export const apiGetQuiz = createServerFn({ method: "POST" })
  .inputValidator((input) =>
    z.object({ deviceToken: z.string().uuid(), quizId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data }) => {
    const { getQuizForParticipant } = await import("./quiz.server");
    return { success: true as const, ...(await getQuizForParticipant(data.deviceToken, data.quizId)) };
  });

export const apiStartAttempt = createServerFn({ method: "POST" })
  .inputValidator((input) =>
    z.object({ deviceToken: z.string().uuid(), quizId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data }) => {
    const { startAttempt } = await import("./quiz.server");
    return { success: true as const, attempt: await startAttempt(data.deviceToken, data.quizId) };
  });

export const apiSaveResponse = createServerFn({ method: "POST" })
  .inputValidator((input) =>
    z
      .object({
        deviceToken: z.string().uuid(),
        attemptId: z.string().uuid(),
        questionId: z.string().uuid(),
        answerId: z.string().uuid(),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const { saveResponse } = await import("./quiz.server");
    return await saveResponse(data);
  });

export const apiFinishAttempt = createServerFn({ method: "POST" })
  .inputValidator((input) =>
    z.object({ deviceToken: z.string().uuid(), attemptId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data }) => {
    const { finishAttempt } = await import("./quiz.server");
    return { success: true as const, ...(await finishAttempt(data.deviceToken, data.attemptId)) };
  });
