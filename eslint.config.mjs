import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    // The design tokens in globals.css are the vocabulary. A raw Tailwind palette class bypasses
    // them silently — which is how the panel green and the candle green ended up being different
    // colours sitting forty pixels apart during the reveal. Semantic names only.
    files: ["src/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector:
            "Literal[value=/\\\\b(?:bg|text|border|ring|from|via|to|fill|stroke|decoration|outline|shadow|divide|accent|caret|placeholder)-(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-\\\\d{2,3}\\\\b/]",
          message:
            "Raw Tailwind palette colour. Use a semantic token from the @theme block in globals.css (surface-*, ink-*, long/short, info, attention, restraint, gold).",
        },
      ],
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
