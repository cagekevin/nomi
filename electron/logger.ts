// 运行期诊断日志门面（主进程唯一写者）——设计见 docs/08-运行期日志系统设计-2026-08-10.md
//
// 目标（D3）：用户报 bug 时，开发者能在一处拿到一条可复现的诊断链。
// 只守三件高 ROI：① ERROR 强制带堆栈 ② scope 分区（对齐业务域）③ IPC 边界 callId。
// 不做全链路 traceId / 渲染环形缓冲 / TRACE 级（ROI 为负，见设计 §1）。
//
// 纪律：
// - 本模块是**运行日志唯一写者**（类比 eventLogRepository 的「唯一写者」）。
// - 真滚动：单段 ≤2MB 滚出 nomi.1.log …，保留最近 5 段，绝不清空当前文件（v1 根因修复）。
//   复用 crashLog 的 MAX_BYTES 常量，但改「超限清空」为「滚动」——crashLog 语义不适用运行日志。
// - redact：保守默认层（redactDeep 已含敏感字段名 + sk-/Bearer 形态）+ catalog secrets 清单，双层。
// - 失败策略：旁路观察，任何 IO 失败只 swallow，绝不打断产品主流程。
// - 时间戳统一 toISOString()（UTC），与 crashLog 一致；排查时日志一律 UTC。
// - ⚠️ 本模块**刻意不 import electron**——纯 Node 单测（systemProxy/vendorBaseFallback/…）要能安全
//   import 本模块而不触发 electron 运行时。日志目录由主进程启动时经 initLogger() 注入（main.ts 有 app），
//   未注入时日志静默退化为 stderr（P2：不因没目录就抛，也不破坏纯 Node 模块）。
import fs from "node:fs";
import path from "node:path";
import { redactDeep } from "./events/redact";

const MAX_BYTES = 2 * 1024 * 1024; // 2MB，与 crashLog 同常量
const MAX_SEGMENTS = 5; // 保留最近 5 段（约 10MB 上限）
const DEFAULT_LEVEL: LogLevel = "INFO";

export type LogLevel = "DEBUG" | "INFO" | "WARN" | "ERROR";
export type LogScope =
  | "lifecycle"
  | "project"
  | "asset"
  | "catalog"
  | "task"
  | "agent"
  | "export"
  | "proxy"
  | "bridge"
  | "ipc";

const LEVEL_ORDER: Record<LogLevel, number> = { DEBUG: 0, INFO: 1, WARN: 2, ERROR: 3 };

let currentLevel: LogLevel = resolveInitialLevel();
let filePathCache: string | null = null;
let dirOverride: string | null = null; // 注入/测试用：日志目录
// 已知密钥清单 provider（默认空，避免纯 Node 模块经此拉到 electron 链）；主进程 init 时注入 catalogSecretsProvider。
let secretsProvider: () => readonly string[] = () => [];
// 应用版本（默认空）；主进程 init 时注入 app.getVersion()（本模块不引 electron）。
let appVersion = "";

function resolveInitialLevel(): LogLevel {
  const fromEnv = process.env.NOMI_LOG_LEVEL?.toUpperCase();
  if (fromEnv === "DEBUG" || fromEnv === "INFO" || fromEnv === "WARN" || fromEnv === "ERROR") return fromEnv;
  return DEFAULT_LEVEL;
}

/** 主进程启动时注入日志目录（app.getPath("logs")）。未注入 → 只 stderr 不落盘（纯 Node 模块安全）。 */
export function initLogger(opts: { logsDir: string; secrets?: () => readonly string[]; version?: string }): void {
  dirOverride = opts.logsDir;
  filePathCache = null;
  if (opts.secrets) secretsProvider = opts.secrets;
  if (opts.version) appVersion = opts.version;
}

/** 测试用：覆盖日志目录（指向临时目录）并重置缓存。 */
export function setLoggerDirForTests(dir: string): void {
  dirOverride = dir;
  filePathCache = null;
}

function logDir(): string | null {
  if (!dirOverride) return null; // 未注入 → 不落盘
  fs.mkdirSync(dirOverride, { recursive: true });
  return dirOverride;
}

function logFilePath(): string | null {
  if (!filePathCache) {
    const dir = logDir();
    if (!dir) return null;
    filePathCache = path.join(dir, "nomi.log");
  }
  return filePathCache;
}

/** 真滚动：当前文件超限 → 依次后移 .1/.2/…，保留最近 MAX_SEGMENTS 段，绝不清空当前文件。 */
function rotateIfNeeded(filePath: string): void {
  let size = 0;
  try {
    size = fs.statSync(filePath).size;
  } catch {
    return; // 文件不存在，无需滚动
  }
  if (size <= MAX_BYTES) return;
  // 删除最旧段，腾出位置给新的 .1
  try {
    fs.rmSync(`${filePath}.${MAX_SEGMENTS - 1}`, { force: true });
  } catch {
    /* ignore */
  }
  for (let i = MAX_SEGMENTS - 2; i >= 1; i -= 1) {
    const from = `${filePath}.${i}`;
    try {
      if (fs.existsSync(from)) fs.renameSync(from, `${filePath}.${i + 1}`);
    } catch {
      /* ignore */
    }
  }
  try {
    fs.renameSync(filePath, `${filePath}.1`);
  } catch {
    /* ignore */
  }
}

/** 运行日志对外级别过滤：当前级别 ≤ 目标级别才放行。 */
export function setLogLevel(level: LogLevel): void {
  currentLevel = level;
}
export function getLogLevel(): LogLevel {
  return currentLevel;
}

function shouldLog(level: LogLevel): boolean {
  return LEVEL_ORDER[level] >= LEVEL_ORDER[currentLevel];
}

type LogEntry = {
  ts: string;
  level: LogLevel;
  scope: LogScope;
  msg: string;
  callId?: string;
  pid: number;
  thread: string;
  meta?: Record<string, unknown>;
  err?: { name: string; message: string; stack: string };
};

function formatEntry(entry: LogEntry): string {
  const line: Record<string, unknown> = {
    ts: entry.ts,
    level: entry.level,
    scope: entry.scope,
    msg: entry.msg,
    pid: entry.pid,
    thread: entry.thread,
  };
  if (entry.callId) line.callId = entry.callId;
  if (entry.err) line.err = entry.err;
  if (entry.meta && Object.keys(entry.meta).length > 0) line.meta = entry.meta;
  return JSON.stringify(line);
}

/** 落盘前双层脱敏：保守默认层（redactDeep 已含敏感字段名 + sk-/Bearer 形态）+ 注入的 secrets 清单。 */
function redactMeta(meta: Record<string, unknown> | undefined): Record<string, unknown> | undefined {
  if (!meta) return meta;
  return redactDeep(meta, secretsProvider()) as Record<string, unknown>;
}

function write(entry: LogEntry): void {
  const file = logFilePath();
  if (file) {
    try {
      rotateIfNeeded(file);
      fs.appendFileSync(file, `${formatEntry(entry)}\n`);
    } catch {
      /* 旁路：落盘失败绝不打断产品主流程 */
    }
  }
  // 镜像到 stderr，至少开发者控制台可见。
  const prefix = `[nomi:${entry.scope}:${entry.level.toLowerCase()}]`;
  if (entry.err) console.error(prefix, entry.msg, entry.err.message);
  else if (entry.level === "WARN") console.warn(prefix, entry.msg);
  else console.log(prefix, entry.msg);
}

/** 渲染层上送丢失的观察：上送失败时主进程侧能看到这一行（fire-and-forget 上送不阻塞渲染）。 */
export function logFlushFailure(scope: LogScope, msg: string, error: unknown): void {
  const message = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
  console.error(`[nomi:${scope}:log-flush] ${msg} ${message}`);
}

function log(level: LogLevel, scope: LogScope, msg: string, opts?: { meta?: Record<string, unknown>; callId?: string; error?: unknown }): void {
  if (!shouldLog(level)) return;
  const entry: LogEntry = {
    ts: new Date().toISOString(),
    level,
    scope,
    msg,
    pid: process.pid,
    thread: "main",
  };
  if (opts?.callId) entry.callId = opts.callId;
  if (opts?.meta) entry.meta = redactMeta(opts.meta);
  if (opts?.error) {
    const err = opts.error instanceof Error ? opts.error : new Error(String(opts.error));
    entry.err = { name: err.name, message: err.message, stack: err.stack || "" };
  }
  write(entry);
}

/** 统一门面（主进程 + 渲染经 IPC 都收敛到这）。 */
export const logger = {
  debug: (scope: LogScope, msg: string, meta?: Record<string, unknown>) => log("DEBUG", scope, msg, { meta }),
  info: (scope: LogScope, msg: string, meta?: Record<string, unknown>) => log("INFO", scope, msg, { meta }),
  warn: (scope: LogScope, msg: string, meta?: Record<string, unknown>) => log("WARN", scope, msg, { meta }),
  // ERROR 强制带错误对象：只记 msg 没堆栈等于没记（v1 漏洞 #4 修复）。
  error: (scope: LogScope, msg: string, error: unknown, meta?: Record<string, unknown>) =>
    log("ERROR", scope, msg, { meta, error }),
  /** IPC 边界两行（recv/done）用——带 callId，见设计 §2.3。 */
  bridgeRecv: (callId: string, channel: string, args: unknown, ts0: string) =>
    log("DEBUG", "bridge", "ipc recv", {
      callId,
      meta: { channel, args: redactMeta({ args })?.args ?? args, ts0 },
    }),
  bridgeDone: (callId: string, channel: string, ms: number) =>
    log("DEBUG", "bridge", "ipc done", { callId, meta: { channel, ms } }),
  bridgeFail: (callId: string, channel: string, ms: number, error: unknown) =>
    log("ERROR", "bridge", "ipc fail", {
      callId,
      error,
      meta: { channel, ms },
    }),
};

/** 读取运行日志文件（含历史段，按时间升序），供诊断面板预览/导出。 */
export function readRunLogs(): { path: string; lines: string[] }[] {
  const file = logFilePath();
  const out: { path: string; lines: string[] }[] = [];
  if (!file) return out; // 未注入目录（纯 Node / 未初始化）→ 无日志可读
  const candidates = [file];
  for (let i = 1; i < MAX_SEGMENTS; i += 1) candidates.push(`${file}.${i}`);
  for (const candidate of candidates) {
    try {
      if (!fs.existsSync(candidate)) continue;
      const raw = fs.readFileSync(candidate, "utf8");
      const lines = raw.split("\n").filter((line) => line.trim().length > 0);
      if (lines.length > 0) out.push({ path: path.basename(candidate), lines });
    } catch {
      /* ignore */
    }
  }
  // 时间升序：最老的段排最前。
  return out.reverse();
}

/** 读取崩溃日志文件（单文件），供诊断面板合并预览。 */
export function readCrashLog(): string[] {
  const dir = logDir();
  if (!dir) return [];
  const file = path.join(dir, "nomi-crash.log");
  try {
    if (!fs.existsSync(file)) return [];
    return fs
      .readFileSync(file, "utf8")
      .split("\n")
      .filter((line) => line.trim().length > 0);
  } catch {
    return [];
  }
}

/** 生成诊断导出包内容（meta.json 的 JSON 字符串 + 崩溃/运行日志文本）。不落盘，由 IPC 调用方处理导出。 */
export function buildDiagnosticsExport(): { meta: string; crash: string; run: string } {
  const crash = readCrashLog().join("\n");
  const run = readRunLogs()
    .flatMap((seg) => seg.lines)
    .join("\n");
  const meta = {
    version: appVersion,
    platform: process.platform,
    arch: process.arch,
    logLevel: currentLevel,
    exportedAt: new Date().toISOString(),
    appPath: process.execPath,
  };
  return { meta: JSON.stringify(meta, null, 2), crash, run };
}
