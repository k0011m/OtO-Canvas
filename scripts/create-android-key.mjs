import { mkdirSync, existsSync, writeFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { spawnSync } from "node:child_process";
import path from "node:path";
const directory = path.resolve(".secrets/android");
mkdirSync(directory, { recursive: true });
const key = path.join(directory, "upload-keystore.jks");
const properties = path.join(directory, "signing.properties");
// 更新不能になる事故を避けるため、既存の鍵や設定は絶対に上書きしない。
if (existsSync(key) || existsSync(properties)) throw new Error("Signing files already exist; keep the original key.");
const password = randomBytes(32).toString("hex");
const javaHome = process.env.JAVA_HOME || (process.platform === "win32" ? "C:/Program Files/Android/Android Studio/jbr" : "");
const keytool = javaHome ? path.join(javaHome, "bin", process.platform === "win32" ? "keytool.exe" : "keytool") : "keytool";
// パスワードはコマンド引数やログに出さず、子プロセスの環境経由で渡す。
const result = spawnSync(keytool, ["-genkeypair", "-v", "-keystore", key, "-storetype", "JKS", "-alias", "upload", "-keyalg", "RSA", "-keysize", "3072", "-validity", "10000", "-dname", "CN=OtO Canvas Upload", "-storepass:env", "OTO_KEY_PASSWORD", "-keypass:env", "OTO_KEY_PASSWORD"], { env: { ...process.env, OTO_KEY_PASSWORD: password }, stdio: "pipe" });
if (result.status !== 0) throw new Error("Key generation failed: " + result.stderr.toString());
writeFileSync(properties, "storeFile=upload-keystore.jks\nkeyAlias=upload\nstorePassword=" + password + "\nkeyPassword=" + password + "\n", { mode: 0o600 });
console.log("Created signing files in .secrets/android. Back up this folder securely; never commit it.");
