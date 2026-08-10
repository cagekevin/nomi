import React from 'react'

import { getActiveWorkbenchProjectId } from '../project/workbenchProjectSession'
import { useProductionRunStore } from './productionRunStore'

const POLL_INTERVAL_MS = 1500

export function useActiveProductionRun(projectId?: string | null) {
  const state = useProductionRunStore()
  const resolvedProjectId = projectId ?? getActiveWorkbenchProjectId()

  React.useEffect(() => {
    if (!resolvedProjectId) {
      useProductionRunStore.getState().reset()
      return
    }
    void useProductionRunStore.getState().load(resolvedProjectId)
    const interval = window.setInterval(() => void useProductionRunStore.getState().poll(), POLL_INTERVAL_MS)
    return () => window.clearInterval(interval)
  }, [resolvedProjectId])

  return state
}
