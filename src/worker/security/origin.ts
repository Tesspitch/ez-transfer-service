/** The public Worker URL is authoritative; forwarded host headers are not. */
export function isAllowedOrigin(
  request: Request,
  configured = "auto",
): boolean {
  const origin = request.headers.get("Origin");
  // Nonbrowser clients still need the endpoint's normal access proof.
  if (origin === null) return true;
  const expected =
    !configured || configured === "auto"
      ? new URL(request.url).origin
      : configured;
  return origin === expected;
}
