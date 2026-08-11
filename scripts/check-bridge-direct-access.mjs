#!/usr/bin/env node
// 桥访问门岗 —— 堵前端「绕桥直读 window.nomiDesktop」。
//
// 为什么：前端业务代码只应经 src/desktop/bridge.ts 的 getDesktopBridge()/isWindows()
// 等门面访问主进程能力。直接 `window.nomiDesktop.xxx` 是绕桥散读，破坏"只能经桥"纪律，
// 且 preload 暴露对象与 DesktopBridge 类型是手写双份（本门岗配合契约化逐步收口）。
//
// 规则：
//   - 扫 src/ 下非测试 .ts/.tsx。
//   - 报「实际属性访问」window.nomiDesktop.<prop>（platform / window / log / ...）。
//   - 白名单 src/desktop/bridge.ts（桥定义处，唯一合法直接访问）。
//   - 注释里的 `window.nomiDesktop`（文档/示例）不报——正则只匹配代码访问。
//   - 测试文件（.test.*）允许 mock window.nomiDesktop，跳过。
//
// 用法：node ./scripts/check-bridge-direct-access.mjs

import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ALLOWED_FILE = "src/desktop/bridge.ts";
// 匹配「window.nomiDesktop.属性 或 window.nomiDesktop?." 的代码访问（非注释行）。
// 用行内容正则：排除以 // 或 * 开头的注释行；匹配 window.nomiDesktop 后紧跟 .prop 或 ?.prop。
const ACCESS_RE = /window\.nomiDesktop(?:\?)?\.[A-Za-z_$]/;
const COMMENT_RE = /^\s*(?:\/\/|\*)/;

function listSrcFiles() {
  const out = execSync("git ls-files src", { cwd: ROOT, encoding: "utf8" });
  return out
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .filter((f) => /\.tsx?$/.test(f))
    .filter((f) => !/\.test\.tsx?$/.test(f))
    .filter((f) => !/\.d\.ts$/.test(f))
    .filter((f) => fs.existsSync(path.join(ROOT, f)));
}

const violations = [];
for (const rel of listSrcFiles()) {
  if (rel === ALLOWED_FILE) continue;
  const lines = fs.readFileSync(path.join(ROOT, rel), "utf8").split("\n");
  lines.forEach((line, i) => {
    if (COMMENT_RE.test(line)) return; // 注释行不算
    if (ACCESS_RE.test(line)) {
      violations.push(`${rel}:${i + 1}: ${line.trim()}`);
    }
  });
}

if (violations.length > 0) {
  console.error("\n桥访问门岗未通过（只能经 getDesktopBridge() 访问主进程）：\n" + violations.join("\n") + "\n");
  console.error("改成 getDesktopBridge()?.xxx 走桥门面；确实要读平台用 isWindows()/getPlatform()。");
  process.exit(1);
}

console.log("✓ 桥访问门岗通过：src/ 下无 window.nomiDesktop 绕桥直读（除 bridge.ts 定义处）。");
