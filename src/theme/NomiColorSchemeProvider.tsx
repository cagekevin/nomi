import React from 'react'
import {
  applyNomiColorScheme,
  NomiColorSchemeContext,
  normalizeColorScheme,
  persistColorScheme,
  resolveInitialColorScheme,
  type NomiColorScheme,
  type NomiColorSchemeContextValue,
} from './colorScheme'

export function NomiColorSchemeProvider({ children }: { children: React.ReactNode }): JSX.Element {
  const [colorScheme, setColorSchemeState] = React.useState<NomiColorScheme>(() => resolveInitialColorScheme())

  const setColorScheme = React.useCallback((scheme: NomiColorScheme) => {
    const normalized = normalizeColorScheme(scheme)
    persistColorScheme(normalized) // 显式选择即写盘——OS 偏好从此不再覆盖。
    setColorSchemeState(normalized)
  }, [])

  React.useEffect(() => {
    applyNomiColorScheme(colorScheme)
  }, [colorScheme])

  const value = React.useMemo<NomiColorSchemeContextValue>(() => ({
    colorScheme,
    isDark: colorScheme === 'dark',
    setColorScheme,
    toggleColorScheme: () => setColorScheme(colorScheme === 'dark' ? 'light' : 'dark'),
  }), [colorScheme, setColorScheme])

  return (
    <NomiColorSchemeContext.Provider value={value}>
      {children}
    </NomiColorSchemeContext.Provider>
  )
}
