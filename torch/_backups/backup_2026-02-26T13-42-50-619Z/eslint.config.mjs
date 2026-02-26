import js from "@eslint/js";
import globals from "globals";

export default [
  {
    ignores: ["dist/", "artifacts/", "test_logs/", "coverage/"],
  },
  js.configs.recommended,
  {
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.node,
      },
      ecmaVersion: "latest",
      sourceType: "module",
    },
    rules: {
      "no-unused-vars": ["error", { "argsIgnorePattern": "^_", "caughtErrorsIgnorePattern": "^_" }],
      "no-console": "off",
    },
  },
];
