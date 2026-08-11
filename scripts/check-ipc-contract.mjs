#!/usr/bin/env node
// IPC 契约门岗 —— 借鉴一毛AI画布「CONTRACTS.md + 契约漂移检测」思路，适配 Nomi。
//
// 目标：IPC channel 必须「只走常量、不走裸字符串」，且常量值唯一、格式合规。
// 这是对 ipcChannels.ts 单一真相源 + check:bridge 门岗的硬保障：
//   - check:bridge 堵前端 `window.nomiDesktop` 绕桥直读；
//   - 本门岗堵 electron 侧 IPC 调用点裸字符串 channel（`ipcMain.on("nomi:...")`）。
//
// 校验项：
//   1. ipcChannels.ts 的 IpcChannels / EventChannels 常量值必须唯一（无重复 channel 名）。
//   2. 常量值必须匹配 `<域>:<动作>` 格式（nomi:* / browser:*），防拼错格式。
//   3. electron/ 下所有 IPC 调用点（ipcMain.handle/on、ipcRenderer.invoke/send/sendSync/on、
//      webContents.send）的 channel 参数必须是 IpcChannels.* / EventChannels.* 常量引用，
//      禁止裸字符串字面量。
//
// 用法：node ./scripts/check-ipc-contract.mjs

import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CHANNELS_FILE = "electron/shared/ipcChannels.ts";

// IPC 调用点正则：第一个实参是 channel。group 1 = 调用后的第一个实参源码片段。
const IPC_CALL_RE = /\b(?:ipcMain\.(?:handle|on)|ipcRenderer\.(?:invoke|send|sendSync|on)|webContents\.send)\(\s*([^,)]+)/g;
// 合法引用：IpcChannels.xxx / EventChannels.xxx
const CONSTANT_REF_RE = /^(?:IpcChannels|EventChannels)\.[A-Za-z_$][\w$]*$/;
// 裸字符串 channel 字面量
const RAW_CHANNEL_RE = /^"((?:nomi|browser):[a-z0-9:-]+)"$/;

const errors = [];

// ── 校验 1 & 2：ipcChannels.ts 常量值唯一（同表内）+ 格式 ─────────────────
// 分 IpcChannels / EventChannels 两段各自校验唯一（同一 channel 名可合法地既是
// 请求又是事件，如 browser:asset-overlay:import-to-canvas，跨表不算重复）。
function checkChannelValues() {
  const src = fs.readFileSync(path.join(ROOT, CHANNELS_FILE), "utf8");
  // 按 `export const XXX = { ... } as const;` 切段
  const sections = [...src.matchAll(/export const (IpcChannels|EventChannels) = \{([\s\S]*?)\} as const;/g)];
  if (sections.length === 0) {
    errors.push(`${CHANNELS_FILE}: 未找到 IpcChannels / EventChannels 常量表`);
    return;
  }
  for (const [, table, body] of sections) {
    const seen = new Map();
    const valueRe = /^\s*([A-Za-z_$][\w$]*):\s*"((?:nomi|browser):[a-z0-9:-]+)",?\s*$/gm;
    let m;
    while ((m = valueRe.exec(body)) !== null) {
      const [, key, value] = m;
      if (seen.has(value)) {
        errors.push(`${CHANNELS_FILE}: ${table} 内 channel 值重复 "${value}"（${seen.get(value)} 与 ${key}）`);
      } else {
        seen.set(value, key);
      }
      // 格式校验：<域>:<段>，段可含连字符，多段冒号分隔（如 nomi:window:close-request）
      if (!/^(nomi|browser):[a-z0-9-]+(?::[a-z0-9-]+)*$/.test(value)) {
        errors.push(`${CHANNELS_FILE}: channel "${value}" 格式非法（期望 <域>:<动作>，如 nomi:projects:list）`);
      }
    }
  }
}

// ── 校验 3：electron 侧 IPC 调用点必须用常量 ─────────────────────────────
function scanIpcCallSites() {
  const out = execSync("git ls-files electron", { cwd: ROOT, encoding: "utf8" });
  const files = out
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .filter((f) => /\.ts$/.test(f))
    .filter((f) => !/\.test\.ts$/.test(f))
    .filter((f) => f !== CHANNELS_FILE)
    .filter((f) => fs.existsSync(path.join(ROOT, f)));

  for (const rel of files) {
    const lines = fs.readFileSync(path.join(ROOT, rel), "utf8").split("\n");
    lines.forEach((line, i) => {
      if (/^\s*(?:\/\/|\*)/.test(line)) return; // 注释行跳过
      IPC_CALL_RE.lastIndex = 0;
      let m;
      while ((m = IPC_CALL_RE.exec(line)) !== null) {
        const arg = m[1].trim();
        if (CONSTANT_REF_RE.test(arg)) continue; // 合法常量引用
        if (RAW_CHANNEL_RE.test(arg)) {
          errors.push(`${rel}:${i + 1}: IPC 裸字符串 channel ${arg}（应改用 IpcChannels.* / EventChannels.* 常量）`);
        }
        // 其他非裸字符串、非常量的（如变量名 channel）不误报——只拦字面量。
      }
    });
  }
}

checkChannelValues();
scanIpcCallSites();

if (errors.length > 0) {
  console.error("\nIPC 契约门岗未通过（channel 必须走 ipcChannels.ts 常量，禁裸字符串 / 禁重复 / 格式合规）：\n" + errors.join("\n") + "\n");
  process.exit(1);
}
console.log("✓ IPC 契约门岗通过：channel 全部走常量，无裸字符串 / 无重复 / 格式合规。");
