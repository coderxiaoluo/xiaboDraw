import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import JavaScriptObfuscator from "javascript-obfuscator";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const distDir = path.join(rootDir, "dist");
const releaseDir = path.join(rootDir, "release");
const shouldZip = process.argv.includes("--zip");

const JS_FILES = ["background.js", "content.js", "options.js", "viewer.js", "history.js"];

const COPY_FILES = [
  "manifest.json",
  "options.html",
  "options.css",
  "content.css",
  "viewer.html",
  "viewer.css",
  "history.html",
  "history.css",
  "LICENSE",
  "PRIVACY.md"
];

const OBFUSCATOR_OPTIONS = {
  compact: true,
  controlFlowFlattening: true,
  controlFlowFlatteningThreshold: 0.4,
  deadCodeInjection: false,
  debugProtection: false,
  disableConsoleOutput: false,
  identifierNamesGenerator: "hexadecimal",
  renameGlobals: false,
  selfDefending: false,
  stringArray: true,
  stringArrayEncoding: ["base64"],
  stringArrayThreshold: 0.75,
  transformObjectKeys: false,
  unicodeEscapeSequence: false,
  // 保留扩展通信与 DOM 查询相关字符串更稳妥；编码仍会打乱可读性
  reservedStrings: [
    "open-panel",
    "get-settings",
    "save-settings",
    "analyze-image",
    "generate-image",
    "open-viewer",
    "open-options",
    "open-history",
    "save-history",
    "list-history",
    "get-history",
    "delete-history",
    "clear-history"
  ]
};

function ensureCleanDir(dir) {
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
}

function copyFile(relativePath) {
  const from = path.join(rootDir, relativePath);
  const to = path.join(distDir, relativePath);
  fs.mkdirSync(path.dirname(to), { recursive: true });
  fs.copyFileSync(from, to);
}

function copyIcons() {
  const from = path.join(rootDir, "icons");
  const to = path.join(distDir, "icons");
  fs.cpSync(from, to, { recursive: true });
}

function obfuscateJs(relativePath) {
  const from = path.join(rootDir, relativePath);
  const source = fs.readFileSync(from, "utf8");
  const result = JavaScriptObfuscator.obfuscate(source, OBFUSCATOR_OPTIONS);
  const to = path.join(distDir, relativePath);
  fs.writeFileSync(to, result.getObfuscatedCode(), "utf8");
  console.log(`obfuscated: ${relativePath}`);
}

function writeDistReadme() {
  const content = `# 小波绘词（发布包）

这是混淆后的扩展安装包，不包含原始可读源码。

## 安装方式

1. 如收到的是 zip，先解压到任意文件夹。
2. 打开 Chrome，进入 \`chrome://extensions/\`。
3. 打开右上角「开发者模式」。
4. 点击「加载已解压的扩展程序」。
5. 选择本目录（包含 manifest.json 的文件夹）。
6. 打开扩展设置页，填写自己的 API Key 后使用。

请勿把本目录再与未混淆源码混用。
`;
  fs.writeFileSync(path.join(distDir, "README.txt"), content, "utf8");
}

function createZip() {
  fs.mkdirSync(releaseDir, { recursive: true });
  const manifest = JSON.parse(fs.readFileSync(path.join(distDir, "manifest.json"), "utf8"));
  const version = String(manifest.version || "0.0.0");
  const zipName = `xiaoboDraw-v${version}.zip`;
  const zipPath = path.join(releaseDir, zipName);

  if (fs.existsSync(zipPath)) {
    fs.rmSync(zipPath, { force: true });
  }

  // Compress-Archive 需要把 dist 内文件打成扁平 zip（解压后直接是 manifest.json）
  const ps = `
$ErrorActionPreference = 'Stop'
$dist = '${distDir.replace(/'/g, "''")}'
$zip = '${zipPath.replace(/'/g, "''")}'
if (Test-Path $zip) { Remove-Item $zip -Force }
Compress-Archive -Path (Join-Path $dist '*') -DestinationPath $zip -Force
`;
  const result = spawnSync("powershell.exe", ["-NoProfile", "-Command", ps], {
    encoding: "utf8"
  });

  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout || "创建 zip 失败");
  }

  console.log(`zip created: ${path.relative(rootDir, zipPath)}`);
  return zipPath;
}

function main() {
  console.log("building obfuscated extension...");
  ensureCleanDir(distDir);

  for (const file of COPY_FILES) {
    copyFile(file);
  }
  copyIcons();

  for (const file of JS_FILES) {
    obfuscateJs(file);
  }

  writeDistReadme();
  console.log(`dist ready: ${path.relative(rootDir, distDir)}`);

  if (shouldZip) {
    createZip();
  } else {
    console.log("tip: run `npm run pack` to also create release/*.zip");
  }
}

main();
