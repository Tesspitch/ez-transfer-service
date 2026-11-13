export class RequestBudget {
  private used = 0;
  constructor(private limit = 40) {}
  take() {
    if (this.used >= this.limit) throw new Error("SUBREQUEST_BUDGET");
    this.used++;
  }
}
export function budgetFetch(
  budget: RequestBudget,
  upstream: typeof fetch = fetch,
): typeof fetch {
  return async (input, init) => {
    budget.take();
    return upstream(input, init);
  };
}
