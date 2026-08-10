import type { DesktopProviderAdapterRun } from '../../desktop/bridge'

const TERMINAL_STAGES = new Set<DesktopProviderAdapterRun['stage']>([
  'completed',
  'partial',
  'failed',
  'needs_ai',
  'stale',
])

export function isAdapterRunTerminal(stage: DesktopProviderAdapterRun['stage']): boolean {
  return TERMINAL_STAGES.has(stage)
}

export function adapterRunProgress(run: DesktopProviderAdapterRun): {
  completed: number
  total: number
  verified: number
  failed: number
} {
  let completed = 0
  let verified = 0
  let failed = 0
  for (const model of run.models) {
    const terminal = model.modes.length > 0 && model.modes.every(mode => mode.state === 'verified' || mode.state === 'failed')
    if (!terminal) continue
    completed += 1
    if (model.modes.some(mode => mode.state === 'verified')) verified += 1
    else failed += 1
  }
  return { completed, total: run.selectedModelKeys.length, verified, failed }
}

type AdapterCardInput = { enabled: boolean; meta?: unknown }
export type AdapterProviderCardState = 'configured' | 'testing' | 'verified' | 'partial' | 'failed'

function modelAdapterState(model: AdapterCardInput): string {
  const meta = model.meta && typeof model.meta === 'object' ? model.meta as Record<string, unknown> : {}
  const adapter = meta.adapter && typeof meta.adapter === 'object' ? meta.adapter as Record<string, unknown> : {}
  return typeof adapter.state === 'string' ? adapter.state : ''
}

export function adapterProviderState(models: AdapterCardInput[]): {
  state: AdapterProviderCardState
  enabled: number
  total: number
} {
  const states = models.map(modelAdapterState)
  let state: AdapterProviderCardState = 'configured'
  if (states.includes('testing')) state = 'testing'
  else if (states.includes('partial')) state = 'partial'
  else if (states.includes('failed')) state = states.some(value => value === 'verified') ? 'partial' : 'failed'
  else if (states.length > 0 && states.every(value => value === 'verified')) state = 'verified'
  return { state, enabled: models.filter(model => model.enabled).length, total: models.length }
}

export function isAdapterModelLocked(meta: unknown): boolean {
  const root = meta && typeof meta === 'object' ? meta as Record<string, unknown> : {}
  const adapter = root.adapter && typeof root.adapter === 'object' ? root.adapter as Record<string, unknown> : {}
  return adapter.state === 'testing' || adapter.state === 'failed'
}
