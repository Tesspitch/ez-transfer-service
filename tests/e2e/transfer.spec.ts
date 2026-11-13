import { test, expect, type Page } from "@playwright/test";
const owner = "11111111-1111-4111-8111-111111111111";
const id = "33333333-3333-4333-8333-333333333333";
const code = "0123456789ABCDEFGHJKMNPQRST";
async function login(page: Page) {
  await page.route("https://auth.example.test/auth/v1/**", async (route) => {
    const user = {
      id: owner,
      email: "user@company.com",
      aud: "authenticated",
      role: "authenticated",
      app_metadata: {},
      user_metadata: {},
      created_at: "2026-01-01T00:00:00Z",
    };
    await route.fulfill({
      json: {
        access_token: "test-token",
        refresh_token: "refresh",
        expires_in: 3600,
        token_type: "bearer",
        user,
      },
    });
  });
  await page.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    const method = route.request().method();
    if (path === "/api/me")
      return route.fulfill({
        json: {
          user: { userId: owner, role: "member" },
          budget: {
            limit_bytes: 8589934592,
            reserved_bytes: 0,
            stored_bytes: 0,
          },
        },
      });
    if (path === "/api/transfers" && method === "GET")
      return route.fulfill({ json: { items: [], nextCursor: null } });
    if (path === "/api/transfers" && method === "POST")
      return route.fulfill({
        status: 201,
        json: {
          id,
          state: "uploading",
          partSizeBytes: 16777216,
          partCount: 1,
          mode: "proxy",
          uploadDeadline: new Date(Date.now() + 7200000).toISOString(),
        },
      });
    if (path.endsWith("/parts"))
      return route.fulfill({
        json: {
          parts: [
            {
              partNumber: 1,
              url: `/api/transfers/${id}/part/1`,
              mode: "proxy",
              expiresAt: new Date(Date.now() + 600000).toISOString(),
            },
          ],
        },
      });
    if (path.endsWith("/part/1")) return route.fulfill({ status: 204 });
    if (path.endsWith("/complete"))
      return route.fulfill({
        json: { id, code, readyAt: new Date().toISOString(), expiresAt: null },
      });
    if (path.endsWith("/resolve"))
      return route.fulfill({
        json: { id, name: "เอกสารทดสอบ.txt", sizeBytes: 3, expiresAt: null },
      });
    return route.fulfill({
      status: 404,
      json: { error: { code: "NOT_FOUND", message: "ไม่พบไฟล์หรือรหัสหมดอายุ" } },
    });
  });
  await page.goto("/");
  await page.getByLabel("อีเมล").fill("user@company.com");
  await page.getByLabel("รหัสผ่าน", { exact: true }).fill("test-password");
  await page.getByRole("button", { name: "เข้าสู่ระบบ", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "ส่งไฟล์ไปอีกเครื่อง" }),
  ).toBeVisible();
}
test("sends Thai filenames, shows code, receives and manages empty list", async ({
  page,
}) => {
  await login(page);
  await page.getByLabel("เลือกไฟล์", { exact: true }).setInputFiles({
    name: "เอกสารทดสอบ.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("abc"),
  });
  await page.getByLabel("เก็บไฟล์ไว้", { exact: true }).selectOption("forever");
  await page.getByRole("button", { name: "อัปโหลดไฟล์" }).click();
  await expect(page.getByText("อัปโหลดสำเร็จ พร้อมรับไฟล์จากอีกเครื่อง")).toBeVisible();
  await expect(page.getByLabel("รหัสรับไฟล์", { exact: true })).toHaveValue(
    /01234/,
  );
  await page
    .getByRole("button", { name: "รับไฟล์", exact: false })
    .filter({ hasText: "02" })
    .click();
  await page.getByLabel("รหัสรับไฟล์", { exact: true }).fill(code);
  await page.getByRole("button", { name: "ค้นหาไฟล์" }).click();
  await expect(
    page.getByRole("heading", { name: "เอกสารทดสอบ.txt" }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "ดาวน์โหลดไฟล์" })).toBeVisible();
  await page.getByRole("button", { name: "ไฟล์ของฉัน", exact: false }).click();
  await expect(page.getByText("ยังไม่มีไฟล์ที่ส่ง")).toBeVisible();
});
test("handles oversize files and captures terminal themes without overflow", async ({
  page,
}) => {
  await login(page);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.getByRole("combobox", { name: "ธีม" }).selectOption("dark");
  await page.screenshot({ path: "test-results/send-dark.png", fullPage: true });
  await page.getByRole("combobox", { name: "ธีม" }).selectOption("light");
  await page.screenshot({
    path: "test-results/send-light.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 375, height: 812 });
  await page.screenshot({
    path: "test-results/send-mobile.png",
    fullPage: true,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
