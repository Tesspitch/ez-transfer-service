import { test, expect } from "@playwright/test";
test("follows system, persists explicit choice, and fits mobile", async ({
  page,
}) => {
  await page.emulateMedia({ colorScheme: "dark" });
  await page.goto("/");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.getByRole("combobox", { name: "ธีม" }).selectOption("light");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
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
});
test("renders accessible login and blocks invalid form submission", async ({
  page,
}) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "เข้าสู่พื้นที่ส่งไฟล์" }),
  ).toBeVisible();
  await expect(page.getByLabel("อีเมล")).toBeVisible();
  await expect(page.getByLabel("รหัสผ่าน", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "เข้าสู่ระบบ", exact: true }).click();
  await expect(page.getByLabel("อีเมล")).toBeFocused();
});
