import type { SupabaseClient } from "@supabase/supabase-js";

async function admin(): Promise<SupabaseClient> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as unknown as SupabaseClient;
}

export function generatePassword(length = 14): string {
  const upper = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  const lower = "abcdefghijkmnopqrstuvwxyz";
  const digits = "23456789";
  const symbols = "!@#$%^&*-_+=";
  const all = upper + lower + digits + symbols;
  const bytes = new Uint32Array(length);
  crypto.getRandomValues(bytes);
  const pick = (set: string, i: number) => set[bytes[i]! % set.length]!;
  const chars = [pick(upper, 0), pick(lower, 1), pick(digits, 2), pick(symbols, 3)];
  for (let i = 4; i < length; i += 1) chars.push(pick(all, i));
  return chars.join("");
}

export async function isSuperAdmin(userId: string): Promise<boolean> {
  const db = await admin();
  const { data } = await db
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "superadmin")
    .maybeSingle();
  return Boolean(data);
}

async function requireSuperAdmin(userId: string) {
  if (!(await isSuperAdmin(userId))) throw new Error("Доступ лише для головного адміністратора");
}

export async function listAdmins(callerId: string) {
  await requireSuperAdmin(callerId);
  const db = await admin();
  const { data: roles, error } = await db.from("user_roles").select("user_id, role");
  if (error) throw new Error(error.message);
  const ids = (roles ?? []).map((r) => r.user_id as string);
  const { data: profiles } = await db
    .from("profiles")
    .select("id, email, name, created_at")
    .in("id", ids.length ? ids : ["00000000-0000-0000-0000-000000000000"]);

  return (profiles ?? []).map((p) => ({
    id: p.id as string,
    email: (p.email as string | null) ?? "",
    name: (p.name as string | null) ?? null,
    created_at: p.created_at as string,
    roles: (roles ?? []).filter((r) => r.user_id === p.id).map((r) => r.role as string),
  }));
}

export async function createAdmin(callerId: string, input: { email: string; name?: string | null }) {
  await requireSuperAdmin(callerId);
  const db = await admin();
  const password = generatePassword();

  const { data, error } = await db.auth.admin.createUser({
    email: input.email.trim().toLowerCase(),
    password,
    email_confirm: true,
    user_metadata: { name: input.name ?? null },
  });
  if (error) throw new Error(error.message);
  const userId = data.user?.id;
  if (!userId) throw new Error("Не вдалося створити акаунт");

  await db.from("profiles").upsert({
    id: userId,
    email: input.email.trim().toLowerCase(),
    name: input.name ?? null,
  });

  const { error: roleError } = await db
    .from("user_roles")
    .upsert({ user_id: userId, role: "admin" }, { onConflict: "user_id,role" });
  if (roleError) throw new Error(roleError.message);

  return { id: userId, email: input.email.trim().toLowerCase(), password };
}

export async function resetAdminPassword(callerId: string, userId: string) {
  await requireSuperAdmin(callerId);
  if (await isSuperAdmin(userId)) throw new Error("Пароль головного адміністратора змінюється окремо");
  const db = await admin();
  const password = generatePassword();
  const { error } = await db.auth.admin.updateUserById(userId, { password });
  if (error) throw new Error(error.message);
  return { password };
}

export async function deleteAdmin(callerId: string, userId: string) {
  await requireSuperAdmin(callerId);
  if (userId === callerId) throw new Error("Не можна видалити власний акаунт");
  if (await isSuperAdmin(userId)) throw new Error("Не можна видалити головного адміністратора");
  const db = await admin();
  const { error } = await db.auth.admin.deleteUser(userId);
  if (error) throw new Error(error.message);
  return { success: true as const };
}

export async function bootstrapSuperAdmin(email: string, password: string) {
  const db = await admin();
  const { data: existing } = await db
    .from("user_roles")
    .select("user_id")
    .eq("role", "superadmin")
    .limit(1);
  if (existing && existing.length > 0) throw new Error("Головний адміністратор вже існує");

  const normalized = email.trim().toLowerCase();
  let userId: string | null = null;

  const { data: created, error } = await db.auth.admin.createUser({
    email: normalized,
    password,
    email_confirm: true,
  });
  if (created?.user?.id) userId = created.user.id;
  else if (error && !/already/i.test(error.message)) throw new Error(error.message);

  if (!userId) {
    const { data: list } = await db.auth.admin.listUsers({ page: 1, perPage: 1000 });
    const found = list?.users?.find((u) => u.email?.toLowerCase() === normalized);
    if (!found) throw new Error("Акаунт не знайдено");
    userId = found.id;
    await db.auth.admin.updateUserById(userId, { password, email_confirm: true });
  }

  await db.from("profiles").upsert({ id: userId, email: normalized });
  await db
    .from("user_roles")
    .upsert({ user_id: userId, role: "superadmin" }, { onConflict: "user_id,role" });
  await db
    .from("user_roles")
    .upsert({ user_id: userId, role: "admin" }, { onConflict: "user_id,role" });

  return { success: true as const, id: userId };
}
