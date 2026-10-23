import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
const folder = new URL("../public/samples/salamander/", import.meta.url);
const manifest = JSON.parse(
  await readFile(new URL("manifest.json", folder), "utf8"),
);
if (manifest.length !== 30) throw Error("Expected all 30 piano samples.");
for (const sample of manifest) {
  const data = await readFile(new URL(sample.name + ".mp3", folder));
  if (
    data.length !== sample.bytes ||
    createHash("sha256").update(data).digest("hex") !== sample.sha256
  )
    throw Error("Piano sample verification failed: " + sample.name);
}
console.log("Verified all 30 bundled piano samples.");
