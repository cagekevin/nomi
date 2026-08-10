// 工作区模式（WorkspaceMode）的单一真相源。
//
// 从 workbenchStore 抽离到共享 config 层：类型零业务依赖（仅依赖自身字面量常量），
// 供「通用 UI（app-shell）不反向依赖业务层」的边界使用——NomiAppBar 需要这个类型来声明
// 模式切换回调，但绝不该 import 整个 workbench store。
export const WORKSPACE_MODES = ['creation', 'generation', 'preview'] as const

export type WorkspaceMode = (typeof WORKSPACE_MODES)[number]

export function isWorkspaceMode(value: unknown): value is WorkspaceMode {
  return typeof value === 'string' && WORKSPACE_MODES.includes(value as WorkspaceMode)
}
