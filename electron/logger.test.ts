// 运行期日志门面单测——聚焦两件安全/正确性不变量：
// ① redact：API key 等敏感值绝不落盘（安全铁律，P2 根因）。
// ② 级别过滤 + 真滚动：默认 INFO 挡 DEBUG；超限滚动保历史段、绝不清空当前文件（v1 根因修复）。
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { getLogLevel, logger, readRunLogs, setLogLevel, setLoggerDirForTests } from "./logger";

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "nomi-logger-"));
  setLoggerDirForTests(tmpDir);
  setLogLevel("INFO");
});

afterEach(() => {
  try {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  } catch {
    /* ignore */
  }
});

function readFile(name: string): string {
  return fs.readFileSync(path.join(tmpDir, name), "utf8");
}

describe("logger redact（安全铁律）", () => {
  it("meta 里的 apiKey 字段 + 8+ 位 sk- 值不落盘", () => {
    logger.info("task", "vendor call", {
      vendor: "replicate",
      apiKey: "sk-abcdef123456", // 字段名命中 SECRET_KEY_NAMES → 整体脱敏
      args: { model: "sk-xyz78901234" }, // 形态命中 sk-{8,} → 脱敏
    });
    const raw = readFile("nomi.log");
    expect(raw).not.toContain("sk-abcdef123456");
    expect(raw).not.toContain("sk-xyz78901234");
    expect(raw).toContain("«redacted»");
  });

  it("error 落盘带 stack，且只记一次", () => {
    logger.error("project", "load failed", new Error("boom"), { projectId: "p1" });
    const raw = readFile("nomi.log");
    const parsed = JSON.parse(raw);
    expect(parsed.level).toBe("ERROR");
    expect(parsed.scope).toBe("project");
    expect(parsed.err.stack).toContain("boom");
  });
});

describe("logger 级别过滤", () => {
  it("默认 INFO 挡 DEBUG，不落盘", () => {
    logger.debug("bridge", "ipc recv", { callId: "c1" });
    expect(fs.existsSync(path.join(tmpDir, "nomi.log"))).toBe(false);
  });

  it("setLogLevel(DEBUG) 后 DEBUG 落盘，callId 走桥专用 API 到顶层字段", () => {
    setLogLevel("DEBUG");
    logger.bridgeRecv("c1", "tasks:run", { projectId: "p1" }, new Date().toISOString());
    const parsed = JSON.parse(readFile("nomi.log"));
    expect(parsed.level).toBe("DEBUG");
    expect(parsed.scope).toBe("bridge");
    expect(parsed.callId).toBe("c1");
    expect(parsed.meta.channel).toBe("tasks:run");
  });
});

describe("logger 真滚动", () => {
  it("超限滚出 .1，不清空当前文件（保留历史）", () => {
    // 写一条触发滚动：先用大 meta 撑爆 2MB 前的阈值较麻烦，直接验证滚动逻辑——写满当前文件后再写，
    // 老文件变 .1 且内容保留。
    // 通过大量行把文件推到超过 MAX_BYTES。为快速测试，直接用 setLogLevel 后写大行。
    setLogLevel("DEBUG");
    const big = "x".repeat(4096);
    // 约 2MB/4097 ≈ 511 行即可超 2MB
    for (let i = 0; i < 600; i += 1) {
      logger.debug("bridge", "fill", { i, big });
    }
    // 滚动后：当前 nomi.log 存在（新段），.1 存在（老段），且 .1 含早期内容
    expect(fs.existsSync(path.join(tmpDir, "nomi.log"))).toBe(true);
    expect(fs.existsSync(path.join(tmpDir, "nomi.log.1"))).toBe(true);
    expect(fs.statSync(path.join(tmpDir, "nomi.log")).size).toBeLessThanOrEqual(2 * 1024 * 1024);
    // 老段 .1 里有早期的 "fill" 记录，没被清空
    expect(readFile("nomi.log.1")).toContain('"level":"DEBUG"');
  });

  it("readRunLogs 按时间升序返回多段", () => {
    setLogLevel("DEBUG");
    logger.info("lifecycle", "first");
    // 手动造一段 .1 来验证排序（写时间更早的内容到 .1）
    fs.writeFileSync(path.join(tmpDir, "nomi.log.1"), '{"ts":"2026-01-01T00:00:00.000Z","level":"INFO","scope":"lifecycle","msg":"old"}');
    const segments = readRunLogs();
    expect(segments.length).toBe(2);
    expect(segments[0].path).toBe("nomi.log.1");
    expect(segments[1].path).toBe("nomi.log");
    expect(getLogLevel()).toBe("DEBUG");
  });
});
