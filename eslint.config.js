import js from "@eslint/js";
import ts from "typescript-eslint";
export default ts.config(
  {
    ignores: [
      "dist/**",
      "node_modules/**",
      "playwright-report/**",
      "test-results/**",
      "cloudflare.config.ts",
      ".cloudflare/**",
      ".wrangler/**",
      ".superpowers/**",
    ],
  },
  js.configs.recommended,
  ...ts.configs.recommended,
  {
    files: ["scripts/*.mjs"],
    languageOptions: {
      globals: {
        process: "readonly",
        console: "readonly",
        Response: "readonly",
      },
    },
  },
  {
    files: ["public/*.js"],
    languageOptions: {
      globals: {
        localStorage: "readonly",
        document: "readonly",
        matchMedia: "readonly",
      },
    },
  },
  {
    files: ["**/*.{ts,tsx}"],
    rules: {
      "no-control-regex": "off",
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_" },
      ],
    },
  },
);
