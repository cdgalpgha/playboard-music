// Checks every sample file listed in each tier manifest against its size and SHA-256.
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";

const root = new URL("../public/samples/", import.meta.url);
let count = 0;
for (const tier of ["lite", "studio", "compat"]) {
  const manifest = JSON.parse(await readFile(new URL(`${tier}/manifest.json`, root), "utf8"));
  const groups = [
    ["zones", tier],
    ["releases", "common"],
    ["harmonics", "common"],
    ["pedal", "common"],
  ];
  for (const [key, folder] of groups) {
    for (const entry of manifest[key]) {
      const data = await readFile(new URL(`${folder}/${entry.file}`, root));
      const digest = createHash("sha256").update(data).digest("hex");
      if (data.length !== entry.bytes || digest !== entry.sha256)
        throw new Error(`Sample verification failed: ${folder}/${entry.file}`);
      count++;
    }
  }
}
console.log(`Verified ${count} sample file entries across lite, studio and compat.`);
