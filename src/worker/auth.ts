import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from "jose";
import { AppError, domainError } from "./errors";
import type { Member } from "../shared/contracts";
export async function verifyToken(
  token: string,
  issuer: string,
  keys: JWTVerifyGetKey,
): Promise<string> {
  const { payload } = await jwtVerify(token, keys, {
    issuer,
    audience: "authenticated",
    algorithms: ["ES256", "RS256"],
  });
  if (!payload.sub) throw new AppError("UNAUTHORIZED", 401);
  return payload.sub;
}
export function tokenVerifier(url: string): (token: string) => Promise<string> {
  const issuer = url.replace(/\/$/, "") + "/auth/v1";
  const keys = createRemoteJWKSet(new URL(issuer + "/.well-known/jwks.json"));
  return (token) => verifyToken(token, issuer, keys);
}
export async function requireMember(
  request: Request,
  verify: (token: string) => Promise<string>,
  lookup: (id: string) => Promise<Member>,
): Promise<Member> {
  const header = request.headers.get("authorization");
  if (!header?.startsWith("Bearer ")) throw new AppError("UNAUTHORIZED", 401);
  let id: string;
  try {
    id = await verify(header.slice(7));
  } catch {
    throw new AppError("UNAUTHORIZED", 401);
  }
  try {
    return await lookup(id);
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw domainError(error instanceof Error ? error.message : "");
  }
}
