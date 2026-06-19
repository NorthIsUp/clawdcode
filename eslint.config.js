// ESLint flat config (v10).
// Biome handles general JS/TS lint + formatting; ESLint adds the things biome
// CAN'T: type-aware rules (it has no type information) across the whole repo,
// plus the React-specific rules for the frontend.
//
// React plugin: @eslint-react/eslint-plugin (the modern rewrite by rel1cx).
import js from "@eslint/js";
import eslintReact from "@eslint-react/eslint-plugin";
import jsxA11yPlugin from "eslint-plugin-jsx-a11y";
import reactHooksPlugin from "eslint-plugin-react-hooks";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    // prompt-kit/** and ui/** are vendored shadcn/prompt-kit components tracked
    // from upstream (and already excluded from biome). We re-sync them, so our
    // house rules shouldn't fight upstream's conventions.
    ignores: [
      "dist/**",
      "node_modules/**",
      ".claude/**",
      "web/v3/components/prompt-kit/**",
      "web/v3/components/ui/**",
    ],
  },
  {
    // Base: type-aware TypeScript + general correctness for the WHOLE codebase —
    // the daemon backend (src/) and the frontend (web/). The type-checked rules
    // (no-floating-promises, no-misused-promises, no-unsafe-*, await-thenable, …)
    // are exactly what biome can't provide, and the async-heavy backend is where
    // they earn their keep most.
    files: ["src/**/*.ts", "web/**/*.{ts,tsx}"],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommendedTypeChecked,
      tseslint.configs.stylisticTypeChecked,
    ],
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
        ecmaFeatures: { jsx: true },
      },
    },
    rules: {
      // A leading underscore marks a deliberately-unused binding.
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrorsIgnorePattern: "^_" },
      ],
      // `??` for objects/numbers (where `||` eats 0 / a valid empty result);
      // `||` stays allowed for string/boolean operands (empty-skip is idiomatic).
      "@typescript-eslint/prefer-nullish-coalescing": [
        "error",
        { ignorePrimitives: { string: true, boolean: true } },
      ],
    },
  },
  {
    // React-specific rules — web/ only (the backend has no JSX).
    files: ["web/**/*.{ts,tsx}"],
    extends: [eslintReact.configs["recommended-typescript"]],
    plugins: {
      "react-hooks": reactHooksPlugin,
      "jsx-a11y": jsxA11yPlugin,
    },
    rules: {
      ...reactHooksPlugin.configs["recommended-latest"].rules,
      ...jsxA11yPlugin.flatConfigs.strict.rules,
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "error",
      // Our toggle rows nest the label text one level below the <input>.
      "jsx-a11y/label-has-associated-control": ["error", { depth: 3 }],
      // Biome already owns noArrayIndexKey; don't double-enforce here.
      "@eslint-react/no-array-index-key": "off",
      // React-Compiler-era rule; we don't run the Compiler and every flagged use
      // is a legitimate effect→state sync, not the derive-in-render anti-pattern.
      "react-hooks/set-state-in-effect": "off",
      "@eslint-react/set-state-in-effect": "off",
    },
  },
);
