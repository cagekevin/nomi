// POC：store ↔ react-flow 单向数据流桥（纯函数，不依赖 DOM，可单测）
//
// 验证目标（对应 baseline §六）：react-flow 渲染 store 的 nodes/edges，交互经桥回写 store。
// 本文件只做「映射 + 回写派发」的纯逻辑——真渲染放 ReactFlowCanvasPoc.tsx。
//
// 关键结论（基线 §四）：Nomi 的 GenerationCanvasNode/Edge 业务字段丰富（kind/result/runs/
// mode/order 等），react-flow 的 Node/Edge 只有 {id, position, data} / {id, source, target}。
// 桥的策略 = store 为唯一真相源，业务字段塞进 data，react-flow 只渲染 + 派发事件，事件回写 store。

import type {
  GenerationCanvasEdge,
  GenerationCanvasNode,
} from '../../workbench/generationCanvas/model/generationCanvasTypes'
import { useGenerationCanvasStore } from '../../workbench/generationCanvas/store/generationCanvasStore'
import type { Connection, Edge, Node, NodeChange } from '@xyflow/react'
import { applyNodeChanges } from '@xyflow/react'

/** react-flow 节点把 Nomi 节点整个塞进 data，渲染层按需读取。 */
export type NomiNodeData = {
  nomiNode: GenerationCanvasNode
}

export type NomiReactFlowNode = Node<NomiNodeData>
export type NomiReactFlowEdge = Edge & { nomiEdge?: GenerationCanvasEdge }

/** store 的 GenerationCanvasNode → react-flow Node（业务字段整包进 data）。 */
export function toReactFlowNode(node: GenerationCanvasNode): NomiReactFlowNode {
  return {
    id: node.id,
    position: { x: node.position.x, y: node.position.y },
    // 业务字段不清空、不拍平——整包塞 data，渲染层按需读，保住唯一真相在 store。
    data: { nomiNode: node },
    ...(node.size ? { width: node.size.width, height: node.size.height } : {}),
  }
}

/** store 的 GenerationCanvasEdge → react-flow Edge（业务 mode/order 挂边对象旁路）。 */
export function toReactFlowEdge(edge: GenerationCanvasEdge): NomiReactFlowEdge {
  return {
    id: edge.id,
    source: edge.source,
    target: edge.target,
    // mode/order 是 Nomi 边语义（react-flow 无此概念），旁路挂上供自定义 Edge 渲染读取。
    nomiEdge: edge,
  }
}

/** 整批转换（POC 当前画布渲染用，全量简单；性能优化 = 后续虚拟化层的事）。 */
export function toReactFlowNodes(nodes: GenerationCanvasNode[]): NomiReactFlowNode[] {
  return nodes.map(toReactFlowNode)
}

export function toReactFlowEdges(edges: GenerationCanvasEdge[]): NomiReactFlowEdge[] {
  return edges.map(toReactFlowEdge)
}

/**
 * 桥的唯一入口：react-flow 的 onNodesChange → 回写 store。
 *
 * POC 只处理两件事（最小闭环）：position 变更（拖拽）与删除。
 * - position change：react-flow 给绝对 position → store.moveNode 绝对位置。
 * - remove change：store.deleteNode。
 * 其余变更（selection 等）POC 忽略，选区本由 store.selectedNodeIds 主导（react-flow 侧不持有真相）。
 */
export function applyNodeChangesToStore(changes: NodeChange<NomiReactFlowNode>[]): void {
  for (const change of changes) {
    if (change.type === 'position' && change.position) {
      useGenerationCanvasStore.getState().moveNode(change.id, change.position)
    } else if (change.type === 'remove') {
      useGenerationCanvasStore.getState().deleteNode(change.id)
    }
  }
}

/** react-flow 的 onConnect（拖线放上目标）→ store.connectNodes。 */
export function applyConnectionToStore(connection: Connection): void {
  if (!connection.source || !connection.target) return
  useGenerationCanvasStore.getState().connectNodes(connection.source, connection.target)
}

/**
 * 反向证明：store 变更 → react-flow 重渲。
 * POC 用「store 订阅」驱动 react-flow nodes/edges（单向桥的渲染半程）。
 * 该函数被 React 组件用来把 store 快照映射成 react-flow 数据，证明「store 变了 react-flow 跟着变」。
 */
export function snapshotToReactFlow(): { nodes: NomiReactFlowNode[]; edges: NomiReactFlowEdge[] } {
  const state = useGenerationCanvasStore.getState()
  return { nodes: toReactFlowNodes(state.nodes), edges: toReactFlowEdges(state.edges) }
}

// 导出供测试/组件使用；applyNodeChanges 在此仅为证明"可借用 xyflow 的 change 语义"，
// POC 实际不依赖它内部状态（store 才是真相）。
export { applyNodeChanges }
