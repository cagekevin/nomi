/**
 * 设置 · 通用 · 诊断（运行期日志）——设计见 docs/08-运行期日志系统设计-2026-08-10.md。
 *
 * 用户摩擦（D1）：报 bug 时「我截图给你，但你还要我翻系统目录找日志」。
 * → 提供：① 日志级别开关（DEBUG 重跑定位）② 崩溃+运行合并预览 ③ 复制/导出诊断包（含 meta.json）。
 *
 * 导出做「单个合并 .txt」（meta.json 头 + 崩溃 + 运行），零新依赖（不引 zip 库），
 * 开发者拿到就是一个可复现诊断链。zip 化等真有拆文件需求再开。
 */
import React from 'react'
import { useTranslation } from 'react-i18next'
import { IconClipboard, IconDownload, IconRefresh } from '@tabler/icons-react'
import { cn } from '../../utils/cn'
import { getDesktopBridge } from '../../desktop/bridge'

type LogLevel = 'DEBUG' | 'INFO' | 'WARN' | 'ERROR'
const LEVELS: LogLevel[] = ['DEBUG', 'INFO', 'WARN', 'ERROR']

function parseTimestamp(line: string): number {
  // JSONL 运行日志: "ts":"..."
  try {
    const obj = JSON.parse(line) as { ts?: string }
    const ts = obj?.ts
    if (ts && !Number.isNaN(Date.parse(ts))) return Date.parse(ts)
  } catch {
    /* not json */
  }
  // 崩溃日志: [ISO] [scope] msg
  const m = /^\[([\dT:.Z-]+)\]/.exec(line)
  if (m && !Number.isNaN(Date.parse(m[1]))) return Date.parse(m[1])
  return 0
}

export function DiagnosticsSection(): JSX.Element {
  const { t } = useTranslation()
  const [level, setLevel] = React.useState<LogLevel>('INFO')
  const [lines, setLines] = React.useState<string[]>([])
  const [copied, setCopied] = React.useState(false)
  const [busy, setBusy] = React.useState(false)
  const bridge = getDesktopBridge()

  const load = React.useCallback((): void => {
    if (!bridge?.diagnostics) return
    void bridge.diagnostics
      .get()
      .then((data) => {
        setLevel((data.logLevel as LogLevel) || 'INFO')
        // 崩溃 + 运行按时间戳合并排序（v3 修正：格式不同，统一按 ts 排，不直接拼）。
        const merged = [...data.crash.split('\n'), ...data.run.split('\n')]
          .filter((l) => l.trim().length > 0)
          .sort((a, b) => parseTimestamp(a) - parseTimestamp(b))
        setLines(merged.slice(-500))
      })
      .catch(() => undefined)
  }, [bridge])

  React.useEffect(load, [load])

  const onLevel = (next: LogLevel): void => {
    setLevel(next)
    if (bridge?.diagnostics) void bridge.diagnostics.setLevel(next).then(load).catch(() => undefined)
  }

  const onCopy = async (): Promise<void> => {
    if (!bridge?.diagnostics) return
    const data = await bridge.diagnostics.get().catch(() => null)
    if (!data) return
    const text = `${data.meta}\n\n${data.crash}\n\n${data.run}`
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1500)
    } catch {
      /* clipboard unavailable */
    }
  }

  const onExport = async (): Promise<void> => {
    if (!bridge?.diagnostics) return
    setBusy(true)
    try {
      const data = await bridge.diagnostics.export()
      const text = `=== meta.json ===\n${data.meta}\n\n=== nomi-crash.log ===\n${data.crash}\n\n=== nomi.log ===\n${data.run}`
      const blob = new Blob([text], { type: 'text/plain;charset=utf-8' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `nomi-diagnostics-${new Date().toISOString().replace(/[:.]/g, '-')}.txt`
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
    } finally {
      setBusy(false)
    }
  }

  if (!bridge?.diagnostics) {
    return (
      <div className="mt-5 border-t border-nomi-line pt-4">
        <div className="mb-1.5 text-body-sm text-nomi-ink">{t('settings.general.diagnostics.title')}</div>
        <div className="text-caption text-nomi-ink-40">{t('settings.general.diagnostics.noBridge')}</div>
      </div>
    )
  }

  return (
    <div className="mt-5 border-t border-nomi-line pt-4">
      <div className="mb-1.5 text-body-sm text-nomi-ink">{t('settings.general.diagnostics.title')}</div>
      <div className="mb-3 text-caption leading-relaxed text-nomi-ink-40">
        {t('settings.general.diagnostics.logLevelHint')}
      </div>

      {/* 日志级别 */}
      <div className="mb-3 text-caption text-nomi-ink-60">{t('settings.general.diagnostics.logLevel')}</div>
      <div className="mb-4 flex flex-wrap gap-1.5" role="radiogroup" aria-label={t('settings.general.diagnostics.logLevel')}>
        {LEVELS.map((lv) => (
          <button
            key={lv}
            type="button"
            role="radio"
            aria-checked={lv === level}
            onClick={() => onLevel(lv)}
            className={cn(
              'rounded-nomi-sm border px-2.5 py-1.5 text-caption cursor-pointer',
              'transition-colors duration-[var(--nomi-transition-fast)]',
              lv === level
                ? 'border-nomi-accent bg-nomi-accent-soft text-nomi-accent'
                : 'border-nomi-line bg-nomi-paper text-nomi-ink-60 hover:bg-nomi-ink-05',
            )}
          >
            {t(`settings.general.diagnostics.logLevels.${lv}`)}
          </button>
        ))}
      </div>

      {/* 操作行 */}
      <div className="mb-1.5 flex items-center justify-between">
        <span className="text-caption text-nomi-ink-60">{t('settings.general.diagnostics.preview')}</span>
        <div className="flex gap-1.5">
          <button
            type="button"
            onClick={load}
            className="inline-flex items-center gap-1 rounded-nomi-sm border border-nomi-line bg-nomi-paper px-2 py-1 text-caption text-nomi-ink cursor-pointer hover:bg-nomi-ink-05"
          >
            <IconRefresh size={13} stroke={1.7} aria-hidden="true" /> {t('settings.general.diagnostics.refresh')}
          </button>
          <button
            type="button"
            onClick={() => void onCopy()}
            className="inline-flex items-center gap-1 rounded-nomi-sm border border-nomi-line bg-nomi-paper px-2 py-1 text-caption text-nomi-ink cursor-pointer hover:bg-nomi-ink-05"
          >
            <IconClipboard size={13} stroke={1.7} aria-hidden="true" /> {copied ? t('settings.general.diagnostics.copied') : t('settings.general.diagnostics.copy')}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void onExport()}
            className="inline-flex items-center gap-1 rounded-nomi-sm border border-nomi-accent bg-nomi-accent-soft px-2 py-1 text-caption text-nomi-accent cursor-pointer hover:bg-nomi-ink-05 disabled:cursor-not-allowed"
          >
            <IconDownload size={13} stroke={1.7} aria-hidden="true" />
            {busy ? t('settings.general.diagnostics.exporting') : t('settings.general.diagnostics.export')}
          </button>
        </div>
      </div>
      <div className="mb-3 text-caption leading-relaxed text-nomi-ink-40">
        {t('settings.general.diagnostics.previewHint')}
      </div>

      {/* 日志预览 */}
      <pre className="max-h-60 overflow-auto rounded-nomi-md border border-nomi-line bg-nomi-ink-05 p-3 font-mono text-micro leading-relaxed text-nomi-ink-70">
        {lines.length > 0 ? lines.join('\n') : t('settings.general.diagnostics.empty')}
      </pre>
    </div>
  )
}
