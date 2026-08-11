// POC（2026-08-11）：settings 域契约单一来源——DesktopSettingsBridge 从
// electron/shared/bridgeContract 的 SettingsBridgeContract 派生，验证 src 侧能
// import electron/shared 并 derive 桥类型。POC 绿后保留，红则回退。
import type { SettingsBridgeContract } from '../../electron/shared/bridgeContract'

export type { ProjectLocationResult as DesktopProjectLocationResult } from '../../electron/shared/bridgeContract'

/** projectLocation 位置实体（从契约结果解出；契约未单独导出，内联推导）。 */
export type DesktopProjectLocation = { path: string; source: 'environment' | 'custom' | 'default' }

export type DesktopProjectLocationError =
  | 'not-directory'
  | 'not-writable'
  | 'open-failed'
  | 'managed-by-environment'

export type DesktopSettingsBridge = {
  projectLocation: SettingsBridgeContract['projectLocation']
  automationPolicy: {
    get: () => Promise<import('../../electron/settings/automationPolicyContract').AutomationPolicySettings>
    set: (payload: unknown) => Promise<import('../../electron/settings/automationPolicyContract').AutomationPolicySettings>
  }
}
