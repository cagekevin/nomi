import React from 'react'

export type NomiColorScheme = 'light' | 'dark'

export type NomiColorSchemeContextValue = {
  colorScheme: NomiColorScheme
  isDark: boolean
  /** 用户显式选择（写盘，OS 偏好从此不再覆盖）。 */
  setColorScheme: (scheme: NomiColorScheme) => void
  toggleColorScheme: () => void
}

export const STORAGE_KEY = 'nomi-color-scheme'
// 默认钉死暗色：用户要求 24h 夜晚模式，不再按本地时间自动在明暗间切换（2026-08-13）。
export const DEFAULT_COLOR_SCHEME: NomiColorScheme = 'dark'

export const NomiColorSchemeContext = React.createContext<NomiColorSchemeContextValue | null>(null)

export function normalizeColorScheme(value: unknown): NomiColorScheme {
  return value === 'dark' ? 'dark' : DEFAULT_COLOR_SCHEME
}

// 已废弃「天黑自动暗」时间窗：用户要求 24h 夜晚模式，不再随本地时间切换（2026-08-13）。
// 常量保留仅作历史引用，不再被任何逻辑读取。
export const NIGHT_START_HOUR = 18
export const NIGHT_END_HOUR = 7

// 恒返回暗色：未显式选过时（首次/未选过）即 24h 夜晚模式，不再读本地时间窗。
export function getTimeBasedColorScheme(_now: Date = new Date()): NomiColorScheme {
  return 'dark'
}

/** 读用户显式存储；无（首次/未选过）返回 null —— 调用方再决定回退到时间策略。 */
export function readStoredColorScheme(): NomiColorScheme | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    return raw === 'dark' || raw === 'light' ? raw : null
  } catch {
    return null
  }
}

export function hasStoredColorScheme(): boolean {
  return readStoredColorScheme() !== null
}

/** 初始方案：用户选过 → 用存储；否则按本地时间（天黑自动暗）。 */
export function resolveInitialColorScheme(): NomiColorScheme {
  return readStoredColorScheme() ?? getTimeBasedColorScheme()
}

/** 把方案落到 document（dataset + Mantine 属性 + color-scheme）。不写存储——跟随系统时不该污染用户选择。 */
export function applyNomiColorScheme(scheme: NomiColorScheme): void {
  if (typeof document === 'undefined') return
  const normalized = normalizeColorScheme(scheme)
  const root = document.documentElement
  root.dataset.theme = normalized
  root.dataset.nomiColorScheme = normalized
  root.setAttribute('data-mantine-color-scheme', normalized)
  root.style.colorScheme = normalized
}

export function persistColorScheme(scheme: NomiColorScheme): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(STORAGE_KEY, normalizeColorScheme(scheme))
  } catch {
    // 存储失败忽略：内存态本会话仍生效。
  }
}

/** 预渲染钉死属性，让 tailwind base 的 [data-mantine-color-scheme="dark"] 即刻命中，避免首帧闪。 */
export function primeNomiColorScheme(): NomiColorScheme {
  const scheme = resolveInitialColorScheme()
  applyNomiColorScheme(scheme)
  return scheme
}

export function useNomiColorScheme(): NomiColorSchemeContextValue {
  const context = React.useContext(NomiColorSchemeContext)
  if (!context) {
    throw new Error('useNomiColorScheme must be used within NomiColorSchemeProvider')
  }
  return context
}
