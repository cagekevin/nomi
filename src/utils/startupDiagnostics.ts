import { logger } from './logger'
import { getDesktopBridge } from '../desktop/bridge'

type StartupMark = {
  label: string
  time: number
}

const marks: StartupMark[] = []
const startedAt = now()
const SLOW_STEP_MS = 250

function now(): number {
  return typeof performance !== 'undefined' ? performance.now() : Date.now()
}

export function markStartup(label: string): void {
  const time = now()
  marks.push({ label, time })
  const previous = marks[marks.length - 2]
  const delta = previous ? time - previous.time : time - startedAt
  const total = time - startedAt
  if (delta >= SLOW_STEP_MS || total >= SLOW_STEP_MS) {
    logger.debug('lifecycle', 'startup step', { label, deltaMs: Math.round(delta), totalMs: Math.round(total) })
  }
}

export function timeStartupStep<T>(label: string, work: () => T, warnMs = SLOW_STEP_MS): T {
  const start = now()
  try {
    return work()
  } finally {
    const duration = now() - start
    if (duration >= warnMs) {
      logger.debug('lifecycle', 'startup step took', { label, ms: Math.round(duration) })
    }
  }
}

export async function timeStartupStepAsync<T>(label: string, work: () => Promise<T>, warnMs = SLOW_STEP_MS): Promise<T> {
  const start = now()
  try {
    return await work()
  } finally {
    const duration = now() - start
    if (duration >= warnMs) {
      logger.debug('lifecycle', 'startup step took', { label, ms: Math.round(duration) })
    }
  }
}

export function markStartupProbe(label: string, payload?: Record<string, unknown>): void {
  getDesktopBridge()?.startupProbe?.mark(label, payload)
}
