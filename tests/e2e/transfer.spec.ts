import { test, expect, type Page } from "@playwright/test";
import { ZipReader, Uint8ArrayReader, TextWriter } from "@zip.js/zip.js";
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
  await expect(page.getByLabel("ลิงก์รับไฟล์", { exact: true })).toHaveValue(
    `http://127.0.0.1:5199/receive#code=${code}`,
  );
  await expect(
    page.getByRole("link", { name: "เปิดลิงก์รับไฟล์", exact: true }),
  ).toHaveAttribute("href", `/receive#code=${code}`);
  await page.getByRole("button", { name: "ไฟล์บนเครื่องนี้", exact: false }).click();
  await expect(page.getByRole("heading", { name: "เอกสาร.txt" })).toBeVisible();
});
test("single receiver survives reload and failed signing without losing claim", async ({
  page,
}) => {
  await mock(page);
  await page.goto("/receive#code=" + code);
  expect(new URL(page.url()).hash).toBe("");
  await expect(
    page.getByRole("heading", { name: "เอกสาร.txt", exact: true }),
  ).toBeVisible();
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

test("receive link automatically finds files without claiming or starting downloads", async ({
  page,
}) => {
  await mock(page, "multiple");
  const actions: string[] = [];
  page.on("request", (request) => {
    if (/\/(claim|download)$/.test(new URL(request.url()).pathname))
      actions.push(request.url());
  });
  await page.goto("/receive#code=" + code);
  await expect(
    page.getByRole("heading", { name: "เอกสาร.txt", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "ดาวน์โหลดไฟล์", exact: false }),
  ).toBeVisible();
  expect(actions).toEqual([]);
  expect(new URL(page.url()).hash).toBe("");
});

test("invalid receive links show an error and allow entering another code", async ({
  page,
}) => {
  await page.route("**/api/**", (route) =>
    route.fulfill({
      status: 404,
      json: { error: { code: "NOT_FOUND", message: "ไม่พบไฟล์หรือรหัสหมดอายุ" } },
    }),
  );
  await page.goto("/receive#code=" + code);
  await expect(page.getByRole("alert")).toHaveText("ไม่พบไฟล์หรือรหัสหมดอายุ");
  await page.getByLabel("รหัสรับไฟล์", { exact: true }).fill("OTHER");
  await expect(
    page.getByRole("button", { name: "ค้นหาไฟล์", exact: false }),
  ).toBeEnabled();
});

test("appends files and uploads only checked files in one ZIP", async ({
  page,
}) => {
  await mock(page);
  let archive: Buffer | null = null;
  await page.route("**/api/transfers/*/part/1", async (route) => {
    archive = route.request().postDataBuffer();
    await route.fulfill({ status: 204 });
  });
  await page.goto("/");
  const picker = page.getByLabel("เลือกไฟล์", { exact: true });
  await picker.setInputFiles([
    { name: "ไทย.txt", mimeType: "text/plain", buffer: Buffer.from("first") },
    {
      name: "exclude.txt",
      mimeType: "text/plain",
      buffer: Buffer.from("private"),
    },
  ]);
  await page
    .getByRole("checkbox", { name: "ส่งไฟล์ exclude.txt", exact: true })
    .uncheck();
  await picker.setInputFiles({
    name: "second.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("second"),
  });
  await expect(page.getByRole("checkbox")).toHaveCount(3);
  await expect(
    page.getByRole("checkbox", { name: "ส่งไฟล์ exclude.txt", exact: true }),
  ).not.toBeChecked();
  await page
    .getByRole("button", { name: "เอาเครื่องหมายออกทั้งหมด", exact: true })
    .click();
  await expect(page.getByRole("button", { name: "อัปโหลดไฟล์" })).toBeDisabled();
  await page.getByRole("button", { name: "เลือกทั้งหมด", exact: true }).click();
  await page
    .getByRole("checkbox", { name: "ส่งไฟล์ exclude.txt", exact: true })
    .uncheck();
  await page.getByRole("button", { name: "อัปโหลดไฟล์" }).click();
  await expect(page.getByText("อัปโหลดสำเร็จ พร้อมรับไฟล์จากอีกเครื่อง")).toBeVisible();
  expect(archive).not.toBeNull();
  const reader = new ZipReader(new Uint8ArrayReader(new Uint8Array(archive!)), {
    useWebWorkers: false,
  });
  try {
    const entries = await reader.getEntries();
    expect(entries.map((entry) => entry.filename)).toEqual([
      "ไทย.txt",
      "second.txt",
    ]);
    expect(
      await Promise.all(
        entries.map((entry) =>
          entry.directory
            ? ""
            : entry.getData(new TextWriter(), { useWebWorkers: false }),
        ),
      ),
    ).toEqual(["first", "second"]);
  } finally {
    await reader.close();
  }
});

test("removes queue entries and fits long filenames on mobile in both themes", async ({
  page,
}) => {
  await page.goto("/");
  await page.setViewportSize({ width: 375, height: 812 });
  const name = "long-".repeat(35) + ".txt";
  await page.getByLabel("เลือกไฟล์", { exact: true }).setInputFiles([
    { name, mimeType: "text/plain", buffer: Buffer.from("a") },
    { name: "remove.txt", mimeType: "text/plain", buffer: Buffer.from("b") },
    { name: "unchecked.txt", mimeType: "text/plain", buffer: Buffer.from("c") },
  ]);
  await page
    .getByRole("button", { name: "เอา remove.txt ออก", exact: true })
    .click();
  await page
    .getByRole("checkbox", { name: "ส่งไฟล์ unchecked.txt", exact: true })
    .uncheck();
  await page
    .getByRole("button", { name: "ลบไฟล์ที่ไม่ได้เลือก", exact: true })
    .click();
  await expect(page.getByRole("checkbox")).toHaveCount(1);
  for (const theme of ["dark", "light"]) {
    await page.getByRole("combobox", { name: "ธีม" }).selectOption(theme);
    await page.evaluate(() => scrollTo(0, 0));
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: `test-results/multi-file-${theme}-mobile.png`,
      fullPage: true,
    });
  }
  await page.getByRole("button", { name: "ล้าง", exact: true }).click();
  await expect(page.getByRole("checkbox")).toHaveCount(0);
});

test("appends multiple dropped and pasted files without clearing valid choices", async ({
  page,
}) => {
  await page.goto("/");
  const zone = page.locator(".drop-zone");
  const dropped = await page.evaluateHandle(() => {
    const data = new DataTransfer();
    data.items.add(new File(["a"], "drop-a.txt"));
    data.items.add(new File(["b"], "drop-b.txt"));
    return data;
  });
  await zone.dispatchEvent("drop", { dataTransfer: dropped });
  await page
    .getByRole("checkbox", { name: "ส่งไฟล์ drop-a.txt", exact: true })
    .uncheck();
  const pasted = await page.evaluateHandle(() => {
    const data = new DataTransfer();
    data.items.add(new File(["c"], "paste-c.txt"));
    data.items.add(new File(["d"], "paste-d.txt"));
    data.items.add(new File([], "empty.txt"));
    return data;
  });
  await page.locator(".panel-body").evaluate((element, data) => {
    element.dispatchEvent(
      new ClipboardEvent("paste", {
        clipboardData: data,
        bubbles: true,
        cancelable: true,
      }),
    );
  }, pasted);
  await expect(page.getByRole("checkbox")).toHaveCount(4);
  await expect(
    page.getByRole("checkbox", { name: "ส่งไฟล์ drop-a.txt", exact: true }),
  ).not.toBeChecked();
  await expect(page.getByRole("alert")).toContainText("empty.txt");
  await dropped.dispose();
  await pasted.dispose();
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
