// NodeReadOnlyContext — 把容器 readOnly 传给 react-flow 节点内容层的通道。
//
// react-flow 的 NodeProps 不携带容器 readOnly（节点只拿 data/selected/dragging 等）。
// S6-readOnly 透传用 React context：容器 `ReactFlowGenerationCanvas` 用 Provider 包节点层，
// `ReactFlowNode` 用 useContext 读 readOnly，替换原先硬编码 false（分享预览等只读态隐藏交互）。
// 保底：未包 Provider 时默认 false（非只读），不破坏既有行为。
import { createContext, useContext } from 'react'

export const NodeReadOnlyContext = createContext<boolean>(false)

export function useNodeReadOnly(): boolean {
  return useContext(NodeReadOnlyContext)
}
