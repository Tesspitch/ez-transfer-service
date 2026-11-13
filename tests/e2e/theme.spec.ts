import { test, expect } from "@playwright/test";
test("opens directly to send with no login and follows persistent themes", async ({
  page,
}) => {
  const authRequests: string[] = [];
  page.on("request", (r) => {
    if (r.url().includes("/auth/v1")) authRequests.push(r.url());
  });
  await page.emulateMedia({ colorScheme: "dark" });
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "ส่งไฟล์ไปอีกเครื่อง" }),
  ).toBeVisible();
  await expect(page.getByLabel("อีเมล")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "เข้าสู่ระบบ" })).toHaveCount(0);
  await expect(
    page.getByRole("radio", { name: "ผู้รับเดียว", exact: false }),
  ).toBeChecked();
  await page.getByRole("combobox", { name: "ธีม" }).selectOption("light");
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await page.setViewportSize({ width: 375, height: 812 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.getByRole("combobox", { name: "ธีม" }).selectOption("system");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  expect(authRequests).toEqual([]);
});
