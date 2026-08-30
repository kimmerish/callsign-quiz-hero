import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/bootstrap-admin")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const body = (await request.json()) as { email?: string; password?: string };
        if (!body.email || !body.password) {
          return new Response("Bad request", { status: 400 });
        }
        try {
          const { bootstrapSuperAdmin } = await import("@/lib/admin-users.server");
          const result = await bootstrapSuperAdmin(body.email, body.password);
          return Response.json(result);
        } catch (error) {
          return Response.json({ error: (error as Error).message }, { status: 400 });
        }
      },
    },
  },
});
