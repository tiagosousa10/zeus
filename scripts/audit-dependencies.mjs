import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
const result = spawnSync("npm", ["audit", "--json"], {
  encoding: "utf8",
  maxBuffer: 16 * 1024 * 1024,
});
if (result.error) throw result.error;
let report;
try {
  report = JSON.parse(result.stdout);
} catch {
  throw new Error("npm audit did not return a report");
}
if (report.error || !report.metadata)
  throw new Error("Dependency audit unavailable");
const lock = JSON.parse(
  readFileSync(new URL("../package-lock.json", import.meta.url), "utf8"),
);
// Reviewed upstream 2026-11-12: tracker client never uses ip.isPublic; the only
// ip call is server/parse-udp.js -> toString. Any version change requires review.
const knownUnreachable =
  lock.packages["node_modules/bittorrent-tracker"]?.version === "11.2.3" &&
  lock.packages["node_modules/ip"]?.version === "2.0.1" &&
  lock.packages["node_modules/webtorrent"]?.version === "3.0.21";
const advisories = new Map();
for (const item of Object.values(report.vulnerabilities || {})) {
  for (const via of item.via)
    if (typeof via === "object") advisories.set(via.url, via);
}
let failures = 0;
for (const [url, advisory] of advisories) {
  if (
    knownUnreachable &&
    url === "https://github.com/advisories/GHSA-2p57-rm9w-gvfp"
  ) {
    console.log(
      `REVIEWED, NOT REACHABLE: ${url} (ip.isPublic absent from tracker code path; version-pinned exception)`,
    );
  } else {
    console.error(`${advisory.severity}: ${url}`);
    failures++;
  }
}
console.log(`${advisories.size} unique advisories; ${failures} unreviewed.`);
process.exitCode = failures ? 1 : 0;
