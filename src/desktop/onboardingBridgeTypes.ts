import type { ProviderKind } from './providerKind'

export type DesktopAdapterModeResult = {
  taskKind: string
  state: 'queued' | 'testing' | 'repairing' | 'verified' | 'failed'
  attempts: number
  stage?: string
  error?: string
  verifiedAt?: string
}

export type DesktopProviderAdapterRun = {
  id: string
  vendorKey: string
  vendorName: string
  selectedModelKeys: string[]
  stage: 'queued' | 'discovering_docs' | 'compiling' | 'testing' | 'repairing' | 'completed' | 'partial' | 'failed' | 'needs_ai' | 'stale'
  currentModelKey?: string
  repairAttempt: number
  models: Array<{ modelKey: string; labelZh: string; kind: string; modes: DesktopAdapterModeResult[] }>
  sourceUrls: string[]
  activeRevision?: string
  error?: string
  createdAt: string
  updatedAt: string
}

type AdapterResponse = Promise<{ ok: boolean; run?: DesktopProviderAdapterRun; error?: string }>

export type DesktopOnboardingBridge = {
  adapterStart: (payload: {
    vendorName: string
    baseUrl: string
    apiKey: string
    authType?: 'none' | 'bearer' | 'x-api-key' | 'query'
    providerKind?: ProviderKind
    headers?: Record<string, string>
    models: Array<{ modelKey: string; labelZh?: string; kind: 'text' | 'image' | 'video' | 'audio' | 'model3d' }>
  }) => AdapterResponse
  adapterGet: (payload: { runId: string }) => AdapterResponse
  adapterLatest: (payload: { vendorKey: string }) => AdapterResponse
  manualCommit: (payload: {
    vendorName: string
    baseUrl: string
    apiKey: string
    providerKind?: ProviderKind
    headers?: Record<string, string>
    models: Array<{ id: string; displayName?: string; kind?: 'text' | 'image' | 'video' | 'audio' }>
  }) => Promise<{
    ok: boolean
    vendorKey?: string
    committed?: Array<{ modelKey: string; displayName: string }>
    error?: string
  }>
  testConnection: (payload: {
    baseUrl: string
    apiKey: string
    modelId?: string
    providerKind?: ProviderKind
    autoProbe?: boolean
    probe?: 'reachability'
    headers?: Record<string, string>
  }) => Promise<{
    ok: boolean
    status?: number
    error?: string
    detectedKind?: ProviderKind
    reachabilityOnly?: boolean
  }>
  listModels: (payload: {
    baseUrl: string
    apiKey: string
    providerKind?: ProviderKind
    headers?: Record<string, string>
  }) => Promise<{ ok: boolean; models?: string[]; status?: number; error?: string }>
  guessKinds: (payload: { ids: string[] }) => Promise<{
    kinds: Record<string, 'text' | 'image' | 'video' | 'audio'>
  }>
}
