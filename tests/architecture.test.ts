import test from "node:test";
import assert from "node:assert/strict";
import { ESLint } from "eslint";

const eslint = new ESLint();
for (const [filePath, source] of [
  [
    "apps/web/src/features/cinema/pages/probe.ts",
    'import { readFile } from "node:fs"; export { readFile };',
  ],
  [
    "apps/web/src/shared/services/probe.ts",
    'export { play } from "../../features/tv/services/playback";',
  ],
  [
    "apps/api/src/modules/member/services/probe.ts",
    'export { Hono } from "hono";',
  ],
  [
    "apps/api/src/modules/auth/account-service.ts",
    'export { Hono } from "hono";',
  ],
  [
    "apps/desktop/src/services/probe.js",
    'module.exports = require("../../../../api/src/app");',
  ],
]) {
  test(`architecture lint rejects an inverted dependency in ${filePath}`, async () => {
    const [result] = await eslint.lintText(source, { filePath });
    assert.ok(
      result.messages.some(
        ({ ruleId }) =>
          ruleId === "no-restricted-imports" ||
          ruleId === "no-restricted-modules",
      ),
    );
  });
}
test("web models can consume public contracts without importing server internals", async () => {
  const [result] = await eslint.lintText(
    'export type { PublicIPTVList } from "../../../../../packages/contracts/member";',
    {
      filePath: "apps/web/src/features/tv/models/probe.ts",
    },
  );
  assert.equal(result.errorCount, 0, JSON.stringify(result.messages));
});
