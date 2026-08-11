/**
 * 桥契约层（POC，2026-08-11）：让 preload 暴露对象 与 src/desktop 桥类型共用一份契约。
 *
 * 为什么：preload.ts（electron/tsconfig, CommonJS）和 src/desktop/bridge.ts（src/tsconfig, Bundler）
 * 是两份手写、零结构性校验——加一个能力要同步两处，preload 漏实现编译不报。
 * 本文件放 electron/shared/，两边都能 import（electron 同 tsconfig；src 靠 import 自动拉文件进编译图）。
 * 纯类型 + 常量引用，**无 electron / node 依赖**，保证两种 moduleResolution 都能解析。
 *
 * 用法（契约单一来源）：
 *  - electron/preload.ts:  const impl = {...} satisfies SettingsBridgeContract
 *  - src/desktop/bridge.ts: export type SettingsBridge = SettingsBridgeContract
 *
 * ⚠️ POC 范围：只做 settings.projectLocation 子域，验证 tsconfig 互通可行性。绿了再铺开。
 */
import type { IpcChannel } from "./ipcChannels";
import { IpcChannels } from "./ipcChannels";
import type { AutomationPolicySettings } from "../settings/automationPolicyContract";

/** 项目库位置（settings.projectLocation）域契约。 */
export type ProjectLocationResult =
  | { ok: true; location: { path: string; source: "environment" | "custom" | "default" }; canceled?: boolean }
  | { ok: false; error: "not-directory" | "not-writable" | "open-failed" | "managed-by-environment" };

export type SettingsBridgeContract = {
  /** 读项目库位置。返回的 source 是「为什么是这个目录」（环境/自定义/默认），UI 据此给不同提示。 */
  projectLocation: {
    get: () => Promise<ProjectLocationResult>
    pick: () => Promise<ProjectLocationResult>
    reset: () => Promise<ProjectLocationResult>
    reveal: () => Promise<ProjectLocationResult>
  }
  /** 自动化策略（任务中心 gate 用）。payload 类型来自 automationPolicyContract（纯类型 import，无运行时依赖）。 */
  automationPolicy: {
    get: () => Promise<AutomationPolicySettings>
    set: (payload: AutomationPolicySettings) => Promise<AutomationPolicySettings>
  }
}

/** 本域真实走的 IPC channel（单一真相，供 preload 实现引用；不改业务 channel 名）。 */
export const SettingsBridgeChannels: Record<string, IpcChannel> = {
  projectLocationGet: IpcChannels.settingsProjectLocationGet,
  projectLocationPick: IpcChannels.settingsProjectLocationPick,
  projectLocationReset: IpcChannels.settingsProjectLocationReset,
  projectLocationReveal: IpcChannels.settingsProjectLocationReveal,
  automationPolicyGet: IpcChannels.settingsAutomationPolicyGet,
  automationPolicySet: IpcChannels.settingsAutomationPolicySet,
} as const;
