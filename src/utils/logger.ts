// 渲染层运行期日志门面——设计见 docs/08-运行期日志系统设计-2026-08-10.md
// 只负责把日志经 nomiDesktop.log 上送主进程（唯一写者），不持 fs、不格式化落盘、无内存缓冲。
// fire-and-forget（ipcRenderer.send），上送失败不阻塞渲染主线程；真崩了内存也没了，无缓冲兜底。
import { getDesktopBridge } from '../desktop/bridge'

export type LogLevel = 'DEBUG' | 'INFO' | 'WARN' | 'ERROR'
export type LogScope =
  | 'lifecycle'
  | 'project'
  | 'asset'
  | 'catalog'
  | 'task'
  | 'agent'
  | 'export'
  | 'proxy'
  | 'bridge'
  | 'ipc'

/** 非桌面运行时（web 预览/测试）退化为 console，保证调用方无感。 */
function send(level: LogLevel, scope: LogScope, msg: string, meta?: Record<string, unknown>, error?: unknown): void {
  const bridge = getDesktopBridge()
  if (bridge?.log) {
    bridge.log(level, scope, msg, { ...meta, ...(error ? { err: toErr(error) } : {}) })
    return
  }
  const prefix = `[nomi:${scope}:${level.toLowerCase()}]`
  if (level === 'ERROR') console.error(prefix, msg, error ?? '')
  else if (level === 'WARN') console.warn(prefix, msg)
  else console.log(prefix, msg)
}

function toErr(error: unknown): { name: string; message: string; stack?: string } {
  if (error instanceof Error) return { name: error.name, message: error.message, stack: error.stack }
  return { name: 'Error', message: String(error) }
}

export const logger = {
  debug: (scope: LogScope, msg: string, meta?: Record<string, unknown>) => send('DEBUG', scope, msg, meta),
  info: (scope: LogScope, msg: string, meta?: Record<string, unknown>) => send('INFO', scope, msg, meta),
  warn: (scope: LogScope, msg: string, meta?: Record<string, unknown>) => send('WARN', scope, msg, meta),
  error: (scope: LogScope, msg: string, error?: unknown, meta?: Record<string, unknown>) =>
    send('ERROR', scope, msg, meta, error),
}
