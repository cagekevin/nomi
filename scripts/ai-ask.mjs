#!/usr/bin/env node
// AI 检索总入口（npm run ask）—— 借鉴一毛AI画布「ai_ask.cjs」思路，适配 Nomi 自研工程。
//
// 为什么：改码前遇到任何"是啥 / 在哪 / 被谁引用"的疑问，跑它一条命令出人话答案，
// 不用自己 grep 一堆 + 猜。让 AI 靠查不靠猜，减少烧 context。
//
// 三种查询：
//   npm run ask -- symbol <关键词>   查符号（函数/类型/常量）定义 + 引用分布
//   npm run ask -- contract <关键词> 查 IPC channel/事件/契约在各层的引用面
//   npm run ask -- file <关键词>     按文件名关键词列相关文件
//
// 零运行时依赖，纯 git ls-files + 正则。输出「落点 + 用途」式人话。

import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const [cmd, ...rest] = process.argv.slice(2);
const keyword = rest.join(" ").trim();

function filesUnder(...dirs) {
  const out = execSync("git ls-files " + dirs.join(" "), { cwd: ROOT, encoding: "utf8" });
  return out.split("\n").map((l) => l.trim()).filter(Boolean).filter((f) => fs.existsSync(path.join(ROOT, f)));
}
function grep(re, files) {
  const hits = [];
  for (const rel of files) {
    const lines = fs.readFileSync(path.join(ROOT, rel), "utf8").split("\n");
    lines.forEach((line, i) => {
      if (re.test(line)) hits.push({ file: rel, line: i + 1, text: line.trim().slice(0, 120) });
    });
  }
  return hits;
}

if (!keyword) {
  console.log("用法:\n  npm run ask -- symbol <关键词>   查符号定义+引用\n  npm run ask -- contract <关键词> 查 IPC channel/事件引用面\n  npm run ask -- file <关键词>     按文件名列相关文件");
  process.exit(0);
}

if (cmd === "file") {
  const files = filesUnder("src", "electron").filter((f) => f.toLowerCase().includes(keyword.toLowerCase()));
  if (files.length === 0) {
    console.log(`未找到文件名含「${keyword}」的文件`);
    process.exit(0);
  }
  console.log(`与「${keyword}」相关的文件（${files.length}）：`);
  for (const f of files.slice(0, 30)) {
    const lines = fs.readFileSync(path.join(ROOT, f), "utf8").split("\n").length;
    console.log(`  ${f}（${lines} 行）`);
  }
  if (files.length > 30) console.log(`  …共 ${files.length} 个，已截断前 30`);
  process.exit(0);
}

if (cmd === "contract") {
  const files = filesUnder("src", "electron");
  const hits = grep(new RegExp(`["']${keyword.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}["']`), files);
  if (hits.length === 0) {
    console.log(`未找到契约「${keyword}」的引用`);
    process.exit(0);
  }
  console.log(`契约「${keyword}」的引用分布（${hits.length} 处）：`);
  for (const h of hits.slice(0, 30)) console.log(`  ${h.file}:${h.line}  ${h.text}`);
  if (hits.length > 30) console.log(`  …共 ${hits.length} 处，已截断前 30`);
  process.exit(0);
}

if (cmd === "symbol") {
  const files = filesUnder("src", "electron");
  // 1) 定义处：export function/const/type/class/interface
  const defRe = new RegExp(`\\b(?:export\\s+)?(?:function|const|let|var|type|interface|class)\\s+(${keyword.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})\\b`);
  // 2) 引用处：非定义行的使用
  const refRe = new RegExp(`\\b${keyword.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`);
  const defs = [], refs = [];
  for (const rel of files) {
    const lines = fs.readFileSync(path.join(ROOT, rel), "utf8").split("\n");
    lines.forEach((line, i) => {
      const text = line.trim();
      if (text.startsWith("//") || text.startsWith("*")) return;
      if (defRe.test(line)) defs.push({ file: rel, line: i + 1, text: text.slice(0, 120) });
      else if (refRe.test(line)) refs.push({ file: rel, line: i + 1 });
    });
  }
  console.log(`符号「${keyword}」定义（${defs.length}）：`);
  if (defs.length === 0) console.log("  无显式定义（可能是 import 的导出或被 mock）");
  for (const d of defs.slice(0, 10)) console.log(`  ${d.file}:${d.line}  ${d.text}`);
  console.log(`\n引用（${refs.length} 处，含定义文件本身）：`);
  const byFile = {};
  for (const r of refs) byFile[r.file] = (byFile[r.file] || 0) + 1;
  const sorted = Object.entries(byFile).sort((a, b) => b[1] - a[1]);
  for (const [file, count] of sorted.slice(0, 15)) console.log(`  ${file} ×${count}`);
  if (sorted.length > 15) console.log(`  …共 ${sorted.length} 个文件`);
  process.exit(0);
}

console.log(`未知命令「${cmd}」（支持 symbol / contract / file）`);
process.exit(1);
