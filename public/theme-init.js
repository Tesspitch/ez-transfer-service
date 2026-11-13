(() => {
  let mode = "system";
  try {
    mode = localStorage.getItem("transfer-theme") || "system";
  } catch {
    /* storage unavailable */
  }
  document.documentElement.dataset.theme =
    mode === "light" || mode === "dark"
      ? mode
      : matchMedia("(prefers-color-scheme: dark)").matches
        ? "dark"
        : "light";
})();
