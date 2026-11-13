import { test, expect, type Page } from "@playwright/test";
const id = "33333333-3333-4333-8333-333333333333";
const code = "0123456789ABCDEFGHJKMNPQRST";
async function mock(page: Page, mode: "single" | "multiple" = "single") {
  let owner = "";
  let receiver = "";
  let claimId = "";
  let claimed = false;
  await page.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    const method = route.request().method();
    const headers = route.request().headers();
    const body = method === "POST" ? route.request().postDataJSON() : {};
    const fail = (status: number, code: string, message: string) =>
      route.fulfill({ status, json: { error: { code, message } } });
    if (path === "/api/transfers" && method === "POST") {
      owner = headers["x-transfer-owner-token"];
      expect(owner).toHaveLength(43);
      expect(body.shareMode).toBe(mode);
      return route.fulfill({
        status: 201,
        json: {
          id,
          state: "uploading",
          partSizeBytes: 16777216,
          partCount: 1,
          mode: "proxy",
          shareMode: mode,
          uploadDeadline: new Date(Date.now() + 7200000).toISOString(),
        },
      });
    }
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
    if (path.endsWith("/part/1")) {
      expect(headers["x-transfer-owner-token"]).toBe(owner);
      return route.fulfill({ status: 204 });
    }
    if (path.endsWith("/complete"))
      return route.fulfill({
        json: {
          id,
          code,
          shareMode: mode,
          readyAt: new Date().toISOString(),
          expiresAt: null,
        },
      });
    if (path.endsWith("/resolve")) {
      if (
        mode === "single" &&
        claimed &&
        headers["x-transfer-receiver-token"] !== receiver
      )
        return fail(409, "FILE_ALREADY_CLAIMED", "ไฟล์นี้มีผู้รับแล้ว");
      return route.fulfill({
        json: {
          id,
          name: "เอกสาร.txt",
          sizeBytes: 3,
          expiresAt: null,
          shareMode: mode,
          receiverStatus:
            mode === "multiple"
              ? "not-required"
              : claimed
                ? "mine"
                : "unclaimed",
        },
      });
    }
    if (path.endsWith("/claim")) {
      expect(mode).toBe("single");
      if (
        claimed &&
        (headers["x-transfer-receiver-token"] !== receiver ||
          body.claimRequestId !== claimId)
      )
        return fail(409, "FILE_ALREADY_CLAIMED", "ไฟล์นี้มีผู้รับแล้ว");
      receiver = headers["x-transfer-receiver-token"];
      claimId = body.claimRequestId;
      claimed = true;
      return route.fulfill({ json: { id, claimed: true } });
    }
    if (path.endsWith("/download"))
      return route.fulfill({
        status: 503,
        json: { error: { code: "UNAVAILABLE", message: "ทดสอบการลองใหม่" } },
      });
    if (path === `/api/transfers/${id}` && method === "GET")
      return route.fulfill({
        json: {
          id,
          name: "เอกสาร.txt",
          sizeBytes: 3,
          state: "ready",
          retention: "forever",
          shareMode: mode,
          claimedAt: null,
          createdAt: new Date().toISOString(),
          expiresAt: null,
          readyAt: new Date().toISOString(),
        },
      });
    return fail(404, "NOT_FOUND", "ไม่พบไฟล์หรือรหัสหมดอายุ");
  });
}
test("sends without login and separates receiving and management links", async ({
  page,
}) => {
  await mock(page, "multiple");
  await page.goto("/");
  await page.getByRole("radio", { name: "หลายผู้รับ", exact: false }).check();
  await page.getByLabel("เลือกไฟล์", { exact: true }).setInputFiles({
    name: "เอกสาร.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("abc"),
  });
  await page.getByRole("button", { name: "อัปโหลดไฟล์" }).click();
  await expect(page.getByText("อัปโหลดสำเร็จ พร้อมรับไฟล์จากอีกเครื่อง")).toBeVisible();
  await expect(page.getByLabel("ลิงก์จัดการไฟล์")).toHaveValue(
    /\/manage#id=.*&owner=/,
  );
  await page.getByRole("button", { name: "ไฟล์บนเครื่องนี้", exact: false }).click();
  await expect(page.getByRole("heading", { name: "เอกสาร.txt" })).toBeVisible();
});
test("single receiver survives reload and failed signing without losing claim", async ({
  page,
}) => {
  await mock(page);
  await page.goto("/receive#code=" + code);
  expect(new URL(page.url()).hash).toBe("");
  await page.getByRole("button", { name: "ค้นหาไฟล์" }).click();
  await page.getByRole("button", { name: "รับสิทธิ์และดาวน์โหลด" }).click();
  await expect(
    page.getByText("ได้รับสิทธิ์แล้ว แต่เริ่มดาวน์โหลดไม่สำเร็จ ลองอีกครั้งได้"),
  ).toBeVisible();
  await page.reload();
  await expect(page.getByText("คุณได้รับสิทธิ์แล้ว", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("button", { name: "ดาวน์โหลดอีกครั้ง" }),
  ).toBeVisible();
});
test("terminal screenshots show both modes and no horizontal mobile overflow", async ({
  page,
}) => {
  await page.goto("/");
  await page.setViewportSize({ width: 1440, height: 1080 });
  await page.getByRole("combobox", { name: "ธีม" }).selectOption("dark");
  await page.screenshot({
    path: "test-results/v2-send-dark.png",
    fullPage: true,
  });
  await page.getByRole("combobox", { name: "ธีม" }).selectOption("light");
  await page.screenshot({
    path: "test-results/v2-send-light.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 375, height: 812 });
  await page.screenshot({
    path: "test-results/v2-send-mobile.png",
    fullPage: true,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
test("an invalid management link cannot overwrite an existing owner capability", async ({
  page,
}) => {
  await page.addInitScript(
    ({ id }) =>
      localStorage.setItem(
        "transfer-owned",
        JSON.stringify([{ id, ownerToken: "A".repeat(43), createdAt: "now" }]),
      ),
    { id },
  );
  await page.route("**/api/**", (r) =>
    r.fulfill({
      status: 404,
      json: { error: { code: "NOT_FOUND", message: "ไม่พบไฟล์หรือรหัสหมดอายุ" } },
    }),
  );
  await page.goto("/manage#id=" + id + "&owner=" + "B".repeat(43));
  await expect(
    page.getByRole("heading", { name: "ไฟล์บนเครื่องนี้" }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => JSON.parse(localStorage.getItem("transfer-owned")!)[0].ownerToken,
    ),
  ).toBe("A".repeat(43));
});
