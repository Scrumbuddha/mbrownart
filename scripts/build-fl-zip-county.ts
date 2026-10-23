// One-off builder. Usage: npx tsx scripts/build-fl-zip-county.ts <path to tab20_zcta520_county20_natl.txt>
// Source: Census Bureau 2020 ZCTA-to-county relationship file (pipe-delimited).
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const input = process.argv[2];
if (!input) throw new Error("Usage: build-fl-zip-county.ts <census file>");

const lines = readFileSync(input, "utf8").replace(/^﻿/, "").split(/\r?\n/);
const header = lines[0].split("|");
const col = (n: string) => header.indexOf(n);
const zi = col("GEOID_ZCTA5_20");
const ci = col("GEOID_COUNTY_20");
const ni = col("NAMELSAD_COUNTY_20");
if ([zi, ci, ni].includes(-1)) throw new Error("Unexpected header: " + lines[0]);

const map: Record<string, string[]> = {};
for (const line of lines.slice(1)) {
  if (!line) continue;
  const f = line.split("|");
  if (!f[zi] || !f[ci].startsWith("12")) continue;
  const county = f[ni].replace(/ County$/, "");
  (map[f[zi]] ??= []).includes(county) || map[f[zi]].push(county);
}
const sorted = Object.fromEntries(
  Object.keys(map).sort().map((z) => [z, map[z].sort()]),
);
const out = join(__dirname, "..", "src", "lib", "tax", "fl-zip-county.json");
writeFileSync(out, JSON.stringify(sorted) + "\n");
console.log(`${Object.keys(sorted).length} ZIPs -> ${out}`);
