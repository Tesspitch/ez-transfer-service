import { describe, expect, it } from "vitest";
import { isAllowedOrigin } from "../../src/worker/security/origin";

const request = (origin?: string) =>
  new Request("https://transfer.example.com/api/transfers", {
    method: "POST",
    headers: origin
      ? { Origin: origin, "X-Forwarded-Host": "evil.example" }
      : {},
  });
describe("same-origin deployment without a preassigned URL", () => {
  it("accepts the current Worker origin in auto mode", () => {
    expect(
      isAllowedOrigin(request("https://transfer.example.com"), "auto"),
    ).toBe(true);
    expect(isAllowedOrigin(request("https://transfer.example.com"))).toBe(true);
  });
  it("rejects other, null and misleading suffix origins", () => {
    for (const origin of [
      "https://evil.example",
      "null",
      "https://transfer.example.com.evil.example",
      "http://transfer.example.com",
    ])
      expect(isAllowedOrigin(request(origin), "auto")).toBe(false);
  });
  it("preserves explicit local development origin and nonbrowser clients", () => {
    expect(
      isAllowedOrigin(
        request("http://127.0.0.1:5173"),
        "http://127.0.0.1:5173",
      ),
    ).toBe(true);
    expect(
      isAllowedOrigin(
        request("http://localhost:5173"),
        "http://127.0.0.1:5173",
      ),
    ).toBe(false);
    expect(isAllowedOrigin(request(), "auto")).toBe(true);
  });
});
