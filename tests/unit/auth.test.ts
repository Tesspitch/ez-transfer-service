import { expect, it } from "vitest";
import { generateKeyPair, SignJWT, exportJWK, createLocalJWKSet } from "jose";
import { verifyToken, requireMember } from "../../src/worker/auth";
it("checks signature issuer audience expiry and fails closed on disabled member", async () => {
  const { privateKey, publicKey } = await generateKeyPair("ES256");
  const key = await exportJWK(publicKey);
  key.kid = "test";
  const jwks = createLocalJWKSet({ keys: [key] });
  const issuer = "https://test.supabase.co/auth/v1";
  const sign = (iss = issuer, aud = "authenticated", exp = "2h") =>
    new SignJWT({})
      .setProtectedHeader({ alg: "ES256", kid: "test" })
      .setSubject("user1")
      .setIssuer(iss)
      .setAudience(aud)
      .setExpirationTime(exp)
      .sign(privateKey);
  const token = await sign();
  expect(await verifyToken(token, issuer, jwks)).toBe("user1");
  await expect(
    verifyToken(await sign("https://evil"), issuer, jwks),
  ).rejects.toThrow();
  await expect(
    verifyToken(await sign(issuer, "other"), issuer, jwks),
  ).rejects.toThrow();
  await expect(
    verifyToken(await sign(issuer, "authenticated", "-1h"), issuer, jwks),
  ).rejects.toThrow();
  await expect(
    requireMember(
      new Request("https://app/api", {
        headers: { Authorization: `Bearer ${token}` },
      }),
      async () => "user1",
      async () => {
        throw new Error("FORBIDDEN");
      },
    ),
  ).rejects.toMatchObject({ status: 403 });
  await expect(
    requireMember(
      new Request("https://app/api", {
        headers: { Authorization: `Bearer ${token}` },
      }),
      async () => "user1",
      async () => {
        throw new Error("network");
      },
    ),
  ).rejects.toMatchObject({ status: 503 });
});
