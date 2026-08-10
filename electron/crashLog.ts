// 生产崩溃落盘（多维审计 P0-8）：主进程未捕获异常与
// 渲染层崩溃统一落到 app logs 目录，省得用户报"打不开"时无任何日志可查（盲修）。
import { app } from "electron";
import fs from "node:fs";
import path from "node:path";

const MAX_BYTES = 2 * 1024 * 1024; // 2MB 简单滚动

function logFilePath(): string {
  const dir = app.getPath("logs"); // macOS: ~/Library/Logs/<app>
  fs.mkdirSync(dir, { recursive: true });
  return path.join(dir, "nomi-crash.log");
}

function append(line: string): void {
  try {
    const file = logFilePath();
    try {
      if (fs.statSync(file).size > MAX_BYTES) fs.writeFileSync(file, "");
    } catch {
      /* 文件不存在，忽略 */
    }
    fs.appendFileSync(file, `[${new Date().toISOString()}] ${line}\n`);
  } catch {
    /* 落盘失败不应再抛，避免崩溃处理本身崩溃 */
  }
}

function recordCrash(scope: string, error: unknown): void {
  const message =
    error instanceof Error ? `${error.name}: ${error.message}\n${error.stack || ""}` : String(error);
  append(`[${scope}] ${message}`);
}

export function logCrash(scope: string, error: unknown): void {
  recordCrash(scope, error);
  console.error(`[nomi:${scope}]`, error);
}

export type CrashMonitorTarget = {
  on(
    event: "uncaughtExceptionMonitor",
    listener: (error: Error, origin: string) => void,
  ): unknown;
};

export type CrashRecorder = (scope: string, error: unknown) => void;

export function installCrashHandlers(
  target: CrashMonitorTarget = process,
  record: CrashRecorder = recordCrash,
): void {
  // 只观察、不接管：Node 会在 monitor 之后保持默认的非零退出。
  // 这里绝不能 console.*；stderr/stdout 本身损坏（EIO/EPIPE）正是常见崩溃源，
  // 再写一次会让崩溃处理器递归触发。
  target.on("uncaughtExceptionMonitor", (error, origin) => record(origin, error));
}
