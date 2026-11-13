import { createClient } from "@supabase/supabase-js";
import { domainError } from "./errors";
import { RequestBudget, budgetFetch } from "./security/request-budget";
export interface Repository {
  call<T>(action: string, p?: Record<string, unknown>): Promise<T>;
}
export function createRepository(
  url: string,
  key: string,
  budget = new RequestBudget(),
): Repository {
  const send = budgetFetch(budget);
  const db = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      fetch: (input, init) =>
        send(input, { ...init, signal: AbortSignal.timeout(15000) }),
    },
  });
  return {
    async call<T>(action: string, p: Record<string, unknown> = {}) {
      const { data, error } = await db.rpc("transfer_rpc_v2", { action, p });
      if (error) throw domainError(error.message);
      return data as T;
    },
  };
}
