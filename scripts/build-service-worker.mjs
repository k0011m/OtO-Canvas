import { readFile, readdir, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { resolve, relative, sep } from "node:path";

const root = resolve("dist");

/** 将来の分割JS・追加音源も含め、配布ファイルをビルドごとに漏れなく集める。 */
async function listFiles(directory) {
  const result = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) result.push(...await listFiles(path));
    else if (!entry.name.endsWith(".map") && !["sw.js", "_headers", "_redirects"].includes(entry.name)) result.push(relative(root, path).split(sep).join("/"));
  }
  return result.sort();
}

const files = await listFiles(root);
const template = await readFile("public/sw.js", "utf8");
const hash = createHash("sha256").update(template);
for (const file of files) hash.update(file).update(await readFile(resolve(root, file)));
const manifest = { version: hash.digest("hex").slice(0, 16), files };
if (!files.includes("index.html") || !files.some((file) => file.endsWith(".js"))) throw new Error("App shell is incomplete");
await writeFile(resolve(root, "sw.js"), template.replace("/* OTO_PRECACHE */ null", JSON.stringify(manifest)));
console.log(`Offline shell: ${files.length} files (${manifest.version})`);
