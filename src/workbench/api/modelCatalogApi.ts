import { getDesktopBridge, type DesktopBridge } from '../../desktop/bridge'
import type { BillingModelKind } from '../../api/desktopClient'
import type { ChipModel } from '../../config/modelChip'

// 单一真相源：复用 desktopClient 的 BillingModelKind（含 'audio'），避免两份定义漂移。
export type { BillingModelKind }

export type ModelCatalogVendorAuthType = 'none' | 'bearer' | 'x-api-key' | 'query'

export type ModelCatalogHealthIssueCode =
  | 'catalog_empty'
  | 'vendor_disabled'
  | 'vendor_api_key_missing'
  | 'model_mapping_missing'

export type ModelCatalogHealthIssueDto = {
  code: ModelCatalogHealthIssueCode
  severity: 'error' | 'warning'
  message: string
  vendorKey?: string
  modelKey?: string
  kind?: BillingModelKind
}

export type ModelCatalogHealthDto = {
  ok: boolean
  counts: {
    vendors: number
    enabledVendors: number
    models: number
    enabledModels: number
    mappings: number
    enabledMappings: number
    enabledApiKeys: number
  }
  byKind: Array<{
    kind: BillingModelKind
    enabledModels: number
    executableModels: number
  }>
  issues: ModelCatalogHealthIssueDto[]
}

export type ModelCatalogVendorDto = {
  key: string
  name: string
  enabled: boolean
  hasApiKey?: boolean
  baseUrlHint?: string | null
  authType?: ModelCatalogVendorAuthType
  authHeader?: string | null
  authQueryParam?: string | null
  meta?: unknown
  createdAt: string
  updatedAt: string
}

export type ModelCatalogModelDto = {
  modelKey: string
  vendorKey: string
  modelAlias?: string | null
  labelZh: string
  kind: BillingModelKind
  enabled: boolean
  meta?: unknown
  /** 自定义调用脚本（接管模型调用用；null=恢复默认）。 */
  customCall?: { script?: string | null } | null
  pricing?: {
    cost: number
    enabled: boolean
    createdAt?: string
    updatedAt?: string
    specCosts: Array<{
      specKey: string
      cost: number
      enabled: boolean
      createdAt?: string
      updatedAt?: string
    }>
  }
  createdAt: string
  updatedAt: string
}

function requireDesktopRuntime(feature: string): DesktopBridge {
  const desktop = getDesktopBridge()
  if (!desktop) throw new Error(`${feature} requires the Electron desktop runtime`)
  return desktop
}

export async function listWorkbenchModelCatalogVendors(): Promise<ModelCatalogVendorDto[]> {
  return requireDesktopRuntime('model catalog').modelCatalog.listVendors() as ModelCatalogVendorDto[]
}

export async function getWorkbenchModelCatalogHealth(): Promise<ModelCatalogHealthDto> {
  return requireDesktopRuntime('model catalog').modelCatalog.health() as ModelCatalogHealthDto
}

export async function listWorkbenchModelCatalogModels(params?: {
  vendorKey?: string
  kind?: BillingModelKind
  enabled?: boolean
}): Promise<ModelCatalogModelDto[]> {
  return requireDesktopRuntime('model catalog').modelCatalog.listModels(params) as ModelCatalogModelDto[]
}

/** 启用/更新一个已存在的目录模型（恢复卡「一键启用被禁用的文本大脑」用）。 */
export async function upsertWorkbenchModelCatalogModel(payload: {
  vendorKey: string
  modelKey: string
  labelZh?: string
  kind?: BillingModelKind
  enabled?: boolean
}): Promise<ModelCatalogModelDto> {
  return requireDesktopRuntime('model catalog').modelCatalog.upsertModel(payload) as ModelCatalogModelDto
}

/** 模型设置面板的目录快照。把「目录 DTO → ChipModel + 脚本表」的编排下沉到 api 层，
 *  UI 只消费结果、不手写 DTO 映射（防 DTO 形状变化后 UI 侧漂移）。 */
export type OnboardingCatalogSnapshot = {
  models: ChipModel[]
  /** 自定义调用脚本正文（编辑器回填用）：`${vendorKey}/${modelKey}` → script。 */
  scripts: Map<string, string>
}

export function loadOnboardingCatalogSnapshot(): OnboardingCatalogSnapshot {
  const desktop = requireDesktopRuntime('model catalog')
  const ms = (desktop.modelCatalog.listModels() ?? []) as ModelCatalogModelDto[]
  const models: ChipModel[] = ms.map((m) => ({
    modelKey: m.modelKey,
    vendorKey: m.vendorKey,
    labelZh: m.labelZh || m.modelKey,
    kind: m.kind as ChipModel['kind'],
    // enabled 缺省视为 true（老快照/DTO 未带时不误停用）。
    enabled: m.enabled !== false,
    meta: m.meta,
    hasCustomCall: Boolean(m.customCall?.script),
  }))
  const scripts = new Map<string, string>()
  for (const m of ms) {
    const script = m.customCall?.script
    if (typeof script === 'string' && script.trim()) {
      scripts.set(`${m.vendorKey}/${m.modelKey}`, script)
    }
  }
  return { models, scripts }
}

/** 试跑自定义调用（真调一次最小请求，返回产物 + transcript）。 */
export async function testRunCustomCall(payload: {
  vendorKey: string
  modelKey: string
  script: string
}): Promise<{
  ok: boolean
  assets: string[]
  errorMessage?: string
  transcript: Array<{
    method: string
    url: string
    status: 'ok' | 'error'
    durationMs: number
    requestPreview?: string
    responsePreview?: string
    errorMessage?: string
  }>
  durationMs: number
}> {
  const desktop = requireDesktopRuntime('model catalog')
  const testRun = desktop.modelCatalog.customCallTestRun
  if (!testRun) throw new Error('custom call test run is unavailable')
  return (await testRun(payload)) as Awaited<ReturnType<typeof testRun>>
}

/** 保存/删除自定义调用脚本（script 留空 = 恢复默认调用）。 */
export function upsertCustomCallModel(payload: {
  vendorKey: string
  modelKey: string
  script: string
}): void {
  const desktop = requireDesktopRuntime('model catalog')
  const trimmed = payload.script.trim()
  desktop.modelCatalog.upsertModel({
    vendorKey: payload.vendorKey,
    modelKey: payload.modelKey,
    customCall: trimmed ? { script: trimmed } : null,
  })
}
