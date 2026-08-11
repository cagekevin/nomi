// settings 域契约单一来源（2026-08-11）：DesktopSettingsBridge 完全从
// electron/shared/bridgeContract 的 SettingsBridgeContract 派生，消除 preload↔bridge 手写双份。
import type { SettingsBridgeContract } from '../../electron/shared/bridgeContract'

export type { ProjectLocationResult as DesktopProjectLocationResult } from '../../electron/shared/bridgeContract'

/** projectLocation 位置实体（从契约结果解出；契约未单独导出，内联推导）。 */
export type DesktopProjectLocation = { path: string; source: 'environment' | 'custom' | 'default' }

export type DesktopProjectLocationError =
  | 'not-directory'
  | 'not-writable'
  | 'open-failed'
  | 'managed-by-environment'

export type DesktopSettingsBridge = SettingsBridgeContract
