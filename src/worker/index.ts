import { createApp } from "./app";
import { createRepository } from "./db";
import { createStorage } from "./storage/r2";
import { runCleanup } from "./jobs/cleanup";
import { reconcileOrphans } from "./jobs/reconcile";
import type { Env } from "./env";
import { RequestBudget } from "./security/request-budget";
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    try {
      const budget = new RequestBudget();
      const deps = {
        repo: createRepository(
          env.SUPABASE_URL,
          env.SUPABASE_SERVICE_ROLE_KEY,
          budget,
        ),
        storage: createStorage(env, budget),
      };
      return await createApp(deps).fetch(request, env);
    } catch {
      return Response.json(
        {
          error: { code: "UNAVAILABLE", message: "ระบบยังไม่พร้อม กรุณาลองใหม่" },
          requestId: crypto.randomUUID(),
        },
        {
          status: 503,
          headers: {
            "Cache-Control": "no-store",
            "X-Content-Type-Options": "nosniff",
          },
        },
      );
    }
  },
  async scheduled(_controller: unknown, env: Env): Promise<void> {
    const budget = new RequestBudget();
    const repo = createRepository(
      env.SUPABASE_URL,
      env.SUPABASE_SERVICE_ROLE_KEY,
      budget,
    );
    const storage = createStorage(env, budget);
    const result = await runCleanup(repo, storage);
    await reconcileOrphans(repo, storage);
    console.log(JSON.stringify({ event: "cleanup", ...result }));
  },
};
