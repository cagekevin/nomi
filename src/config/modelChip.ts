// 模型 chip 的业务类型：从 UI（src/ui/onboarding/）下沉到共享 config 层。
//
// 背景：ChipModel 是「模型目录 DTO → 设置面板 chip」的业务模型，曾定义在 ModelChipGroups.tsx 里，
// 使业务类型漏在 UI。业务类型应住在共享层，UI 只消费、不定义。
import type { BillingModelKind } from '../api/desktopClient'

export type ModelChipKind = 'text' | 'image' | 'video' | 'audio' | 'model3d'

export type ChipModel = {
  modelKey: string
  vendorKey: string
  labelZh: string
  kind: ModelChipKind
  /** 是否启用（enabled:false 的模型不进生成下拉/runtime，供中转站批量启停编辑用）。 */
  enabled: boolean
  /** 后端模型扩展信息；通用 chip 不消费，专用卡可透传读取。 */
  meta?: unknown
  /** 该模型是否已设自定义调用脚本（模型行图标点亮 + 角标；chip 不消费）。 */
  hasCustomCall?: boolean
}

// ChipModel.kind 的取值与后端 BillingModelKind 同源（text|image|video|audio|model3d）。
// 这里显式声明二者一致，防 DTO 迁移后 kind 与分组漂移。
export type ModelChipKindDto = BillingModelKind
