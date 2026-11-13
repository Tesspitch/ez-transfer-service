import { expect, it, vi } from "vitest";
import {
  RequestBudget,
  budgetFetch,
} from "../../src/worker/security/request-budget";
it("shares a hard network budget and refuses the next subrequest before issuing it", async () => {
  const budget = new RequestBudget(40);
  const upstream = vi.fn(async () => new Response("{}"));
  const send = budgetFetch(budget, upstream);
  for (let i = 0; i < 40; i++) await send("https://example.test");
  await expect(send("https://example.test")).rejects.toThrow(
    "SUBREQUEST_BUDGET",
  );
  expect(upstream).toHaveBeenCalledTimes(40);
});
