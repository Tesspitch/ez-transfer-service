export type Theme = "system" | "dark" | "light";
export function applyTheme(theme: Theme) {
  document.documentElement.dataset.theme =
    theme === "system"
      ? matchMedia("(prefers-color-scheme: dark)").matches
        ? "dark"
        : "light"
      : theme;
  try {
    localStorage.setItem("transfer-theme", theme);
  } catch {
    /* optional preference storage */
  }
}
export function storedTheme(): Theme {
  try {
    const value = localStorage.getItem("transfer-theme");
    if (value === "dark" || value === "light") return value;
  } catch {
    /* optional */
  }
  return "system";
}
