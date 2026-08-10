// 运行期日志 IPC 注册——渲染层上送/级别开关/诊断导出。
// 独立模块（守「低争用子系统文件」并行纪律，不塞 store 根/热门入口）。
import { ipcMain } from "electron";
import { IpcChannels } from "./shared/ipcChannels";
import { buildDiagnosticsExport, getLogLevel, logger, logFlushFailure, setLogLevel, type LogLevel, type LogScope } from "./logger";

/** 渲染层上送的有效日志级别白名单，防脏数据进日志文件。 */
const VALID_LEVELS: LogLevel[] = ["DEBUG", "INFO", "WARN", "ERROR"];
const VALID_SCOPES: LogScope[] = [
  "lifecycle",
  "project",
  "asset",
  "catalog",
  "task",
  "agent",
  "export",
  "proxy",
  "bridge",
  "ipc",
];

export function registerLogIpc(): void {
  // 渲染层上送：fire-and-forget，不阻塞渲染主线程；校验后再交给 logger（唯一写者）。
  ipcMain.on(IpcChannels.logSend, (_event, payload: unknown) => {
    try {
      const p = (payload ?? {}) as { level?: unknown; scope?: unknown; msg?: unknown; meta?: unknown };
      const level = String(p.level ?? "").toUpperCase();
      const scope = String(p.scope ?? "");
      if (!VALID_LEVELS.includes(level as LogLevel) || !VALID_SCOPES.includes(scope as LogScope)) return;
      const msg = String(p.msg ?? "");
      const meta = typeof p.meta === "object" && p.meta !== null ? (p.meta as Record<string, unknown>) : undefined;
      const fn = level === "ERROR" ? logger.error : level === "WARN" ? logger.warn : level === "DEBUG" ? logger.debug : logger.info;
      // ERROR 上送不强制带 error 对象（渲染侧没传）；但 INFO/WARN/DEBUG 直接走统一门面。
      if (level === "ERROR") {
        // 渲染层 error 上送：meta 可带 err 对象，否则至少记 msg。
        const err = (meta?.err ?? meta?.error) as unknown;
        const errObj = err instanceof Error ? err : err ? new Error(String(err)) : undefined;
        if (errObj) logger.error(scope as LogScope, msg, errObj, meta);
        else logger.error(scope as LogScope, msg, new Error(msg), meta);
      } else {
        (fn as (s: LogScope, m: string, meta?: Record<string, unknown>) => void)(scope as LogScope, msg, meta);
      }
    } catch (error) {
      logFlushFailure("ipc", "renderer log send failed", error);
    }
  });

  ipcMain.handle(IpcChannels.logLevelGet, () => getLogLevel());

  ipcMain.handle(IpcChannels.logLevelSet, (_event, level: unknown) => {
    const lv = String(level ?? "").toUpperCase();
    if (!VALID_LEVELS.includes(lv as LogLevel)) return getLogLevel();
    setLogLevel(lv as LogLevel);
    logger.info("lifecycle", "log level changed", { level: lv });
    return lv as LogLevel;
  });

  ipcMain.handle(IpcChannels.logDiagnosticsGet, () => {
    const exp = buildDiagnosticsExport();
    return {
      logLevel: getLogLevel(),
      crash: exp.crash,
      run: exp.run,
      meta: exp.meta,
    };
  });

  ipcMain.handle(IpcChannels.logDiagnosticsExport, () => buildDiagnosticsExport());
}
