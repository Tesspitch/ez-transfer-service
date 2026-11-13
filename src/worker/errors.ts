export class AppError extends Error {
  constructor(
    public code: string,
    public status = 400,
  ) {
    super(code);
  }
}
export function domainError(message: string): AppError {
  const codes: Record<string, number> = {
    FILE_ALREADY_CLAIMED: 409,
    MODE_MISMATCH: 409,
    NOT_FOUND: 404,
    FORBIDDEN: 403,
    QUOTA: 409,
    RATE: 429,
    STATE: 409,
    IDEMPOTENCY_CONFLICT: 409,
    GONE: 410,
    INVALID: 400,
  };
  for (const [code, status] of Object.entries(codes))
    if (message.includes(code)) return new AppError(code, status);
  return new AppError("UNAVAILABLE", 503);
}
