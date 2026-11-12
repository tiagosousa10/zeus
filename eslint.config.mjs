import js from "@eslint/js";
import { builtinModules } from "node:module";
import ts from "typescript-eslint";
import globals from "globals";
import hooks from "eslint-plugin-react-hooks";
import prettier from "eslint-config-prettier";

const browserForbidden = [
  ...builtinModules,
  "node:*",
  "electron",
  "**/api/src/**",
  "**/desktop/**",
];
const code = ["**/*.{js,cjs,mjs,ts,tsx,mts}"];
const tsFiles = ["**/*.{ts,tsx,mts}"];
const unused = {
  args: "none",
  caughtErrors: "none",
  varsIgnorePattern: "^_",
  ignoreRestSiblings: true,
};
export default ts.config(
  {
    ignores: [
      "**/node_modules/**",
      "**/dist/**",
      "**/build/**",
      "**/coverage/**",
      "**/.*/**",
      "prototipos/**",
      "apps/web/public/art/**",
      "docs/**",
      "security/**",
      "test-results/**",
      "playwright-report/**",
    ],
  },
  { ...js.configs.recommended, files: code },
  ...ts.configs.recommended.map((config) => ({ ...config, files: tsFiles })),
  {
    files: code,
    languageOptions: { globals: globals.node },
    rules: {
      "no-unused-vars": ["error", unused],
      "no-empty": ["error", { allowEmptyCatch: true }],
      "no-constant-condition": ["error", { checkLoops: false }],
    },
  },
  {
    files: tsFiles,
    rules: {
      "no-unused-vars": "off",
      "@typescript-eslint/no-unused-vars": ["error", unused],
      // Unknown third-party media payloads are progressively typed at adapters.
      // TypeScript strict checking remains mandatory; this is not a correctness rule.
      "@typescript-eslint/no-explicit-any": "off",
    },
  },
  {
    files: ["tests/**/*.mjs", "apps/desktop/scripts/build-icon.mjs"],
    languageOptions: { globals: globals.browser },
  },
  {
    files: ["apps/desktop/**/*.js", "packages/**/*.cjs", "**/*.cjs"],
    languageOptions: { sourceType: "commonjs" },
  },
  {
    files: ["apps/web/src/**/*.{ts,tsx,js}"],
    languageOptions: {
      globals: {
        ...Object.fromEntries(
          Object.keys(globals.node).map((name) => [name, "off"]),
        ),
        ...globals.browser,
      },
    },
    plugins: { "react-hooks": hooks },
    rules: {
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "error",
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: browserForbidden,
              message:
                "The web app uses shared contracts and HTTP services, never backend or desktop internals.",
            },
          ],
        },
      ],
    },
  },
  {
    files: ["apps/web/src/shared/**/*.{ts,tsx,js}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: [...browserForbidden, "**/features/**", "**/app/**"],
              message:
                "Shared modules must remain independent of features and applications.",
            },
          ],
        },
      ],
    },
  },
  {
    files: ["apps/web/src/features/**/*.{ts,tsx,js}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: [...browserForbidden, "**/app/**"],
              message:
                "Features may not import application composition or server internals.",
            },
          ],
        },
      ],
    },
  },
  {
    files: ["apps/web/src/features/**/pages/**/*.tsx"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: [
                ...browserForbidden,
                "**/app/**",
                "**/shared/services/api",
                "**/shared/services/api.ts",
              ],
              message:
                "Pages compose feature services and hooks, not raw HTTP or server implementations.",
            },
          ],
        },
      ],
    },
  },
  {
    files: ["apps/api/src/**/*.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: [
                "react",
                "react/*",
                "electron",
                "**/web/src/**",
                "**/desktop/src/**",
              ],
              message: "The API does not depend on client applications.",
            },
          ],
        },
      ],
    },
  },
  {
    files: ["apps/desktop/src/**/*.{js,cjs}"],
    rules: {
      "no-restricted-modules": [
        "error",
        { patterns: ["**/api/src/**", "**/web/src/**"] },
      ],
    },
  },
  {
    files: [
      "apps/api/src/**/{services,models}/**/*.ts",
      "apps/api/src/**/{service,models}.ts",
      "apps/api/src/**/*-service.ts",
    ],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: [
                "hono",
                "hono/*",
                "react",
                "react/*",
                "electron",
                "**/controllers*",
                "**/controllers/**",
                "**/routes*",
                "**/routes/**",
                "**/web/src/**",
                "**/desktop/src/**",
              ],
              message:
                "Domain models and services do not depend on HTTP controllers or client applications.",
            },
          ],
        },
      ],
    },
  },
  prettier,
);
