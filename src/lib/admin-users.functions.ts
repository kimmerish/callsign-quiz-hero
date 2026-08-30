import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const apiWhoAmI = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { isSuperAdmin } = await import("./admin-users.server");
    return {
      success: true as const,
      userId: context.userId,
      isSuperAdmin: await isSuperAdmin(context.userId),
    };
  });

export const apiListAdmins = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { listAdmins } = await import("./admin-users.server");
    return { success: true as const, admins: await listAdmins(context.userId) };
  });

export const apiCreateAdmin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        email: z.string().trim().email(),
        name: z.string().trim().max(80).nullable().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { createAdmin } = await import("./admin-users.server");
    const result = await createAdmin(context.userId, { email: data.email, name: data.name ?? null });
    return { success: true as const, ...result };
  });

export const apiResetAdminPassword = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ userId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { resetAdminPassword } = await import("./admin-users.server");
    return { success: true as const, ...(await resetAdminPassword(context.userId, data.userId)) };
  });

export const apiDeleteAdmin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ userId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { deleteAdmin } = await import("./admin-users.server");
    return await deleteAdmin(context.userId, data.userId);
  });
