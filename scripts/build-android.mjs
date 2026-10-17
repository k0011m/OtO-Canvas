import { existsSync, mkdirSync, copyFileSync, readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import path from "node:path";
const root = process.cwd();
const pkg = JSON.parse(readFileSync("package.json", "utf8"));
const javaHome = process.env.JAVA_HOME || (process.platform === "win32" ? "C:/Program Files/Android/Android Studio/jbr" : undefined);
const env = { ...process.env, ...(javaHome ? { JAVA_HOME: javaHome } : {}) };
/** 外部ビルドが失敗したら後続のコピーを止め、古い成果物を新版として渡さない。 */
function run(command, args, cwd = root) {
  const result = spawnSync(command, args, { cwd, env, stdio: "inherit", shell: process.platform === "win32" });
  if (result.status !== 0) process.exit(result.status || 1);
}
if (!existsSync(".secrets/android/signing.properties")) throw new Error("Run npm run android:key once, then back up .secrets/android.");
run("npm", ["run", "android:sync"]);
run(process.platform === "win32" ? "gradlew.bat" : "./gradlew", ["--no-daemon", "assembleRelease", "bundleRelease", "lintRelease"], path.join(root, "android"));
const output = path.join(root, "android-release", pkg.version);
mkdirSync(output, { recursive: true });
const files = { apk: "apk/release/app-release.apk", aab: "bundle/release/app-release.aab" };
const checksums = [];
for (const [extension, relative] of Object.entries(files)) {
  const name = "OtO-Canvas-" + pkg.version + "." + extension;
  const target = path.join(output, name);
  copyFileSync(path.join(root, "android/app/build/outputs", relative), target);
  checksums.push(createHash("sha256").update(readFileSync(target)).digest("hex") + "  " + name);
}
writeFileSync(path.join(output, "SHA256SUMS.txt"), checksums.join("\n") + "\n");
console.log("Signed APK and AAB: " + output);
