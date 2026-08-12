// 数据流桥（正式层，S1）：store ↔ react-flow 单向数据流桥（纯函数，不依赖 DOM，可单测）。
//
// 依赖方向（红线）：container → bridge → store actions，**单向**。container 不得反向 import store 的渲染层。
// 策略 = store 是唯一真相源：react-flow 只渲染 + 派发事件，事件经本桥回写 store。
// 本文件只做「映射 + 回写派发」的纯逻辑，真渲染放 ReactFlowGenerationCanvas.tsx。
//
// 坐标语义铁律：position 保持 store 的 canvas 坐标，禁止改成 react-flow 相对坐标
// （Agent 布局 trajectoryLayout + 渲染一致性全依赖它）。
import type {
  GenerationCanvasEdge,
  GenerationCanvasNode,
} from '../model/generationCanvasTypes'
import { useGenerationCanvasStore } from '../store/generationCanvasStore'
import type { Connection, Edge, Node, NodeChange } from '@xyflow/react'

/** react-flow 节点把 Nomi 节点整个塞进 data，渲染层按需读取（业务字段不清空、不拍平——唯一真相在 store）。 */
export type NomiNodeData = {
  nomiNode: GenerationCanvasNode
}

export type NomiEdgeData = {
  /** Nomi 边业务语义整包进 data（mode/order/viaGroupId 等，react-flow 无此概念），自定义 Edge 渲染读取。 */
  nomiEdge: GenerationCanvasEdge
}

export type NomiReactFlowNode = Node<NomiNodeData>
export type NomiReactFlowEdge = Edge<NomiEdgeData>

/** store 的 GenerationCanvasNode → react-flow Node（业务字段整包进 data）。 */
export function toReactFlowNode(node: GenerationCanvasNode): NomiReactFlowNode {
  // 只塞 width（= 用户缩放后的真实宽 node.size.width），不塞 height：
  // 节点高度是内容驱动的（resolveNodeVisualSize: resolvePreviewHeight 受 meta.previewHeight 影响，非固定值），
  // 塞死 height 会与 composer/media 实际渲染高度错位（plan §三.5 补强 5）。高度由 react-flow 自测 DOM。
  return {
    id: node.id,
    position: { x: node.position.x, y: node.position.y },
    data: { nomiNode: node },
    ...(node.size ? { width: node.size.width } : {}),
  }
}

/** store 的 GenerationCanvasEdge → react-flow Edge（业务 mode/order 整包进 data，自定义 Edge 渲染读取）。 */
export function toReactFlowEdge(edge: GenerationCanvasEdge): NomiReactFlowEdge {
  return {
    id: edge.id,
    source: edge.source,
    target: edge.target,
    // mode/order 是 Nomi 边语义（react-flow 无此概念），整包进 data.nomiEdge（对齐节点 data.nomiNode 模式）。
    data: { nomiEdge: edge },
  }
}

/** 整批转换（S1 全量简单；性能优化 = 后续 S5 LOD 虚拟化层的事）。 */
export function toReactFlowNodes(nodes: GenerationCanvasNode[]): NomiReactFlowNode[] {
  return nodes.map(toReactFlowNode)
}

export function toReactFlowEdges(edges: GenerationCanvasEdge[]): NomiReactFlowEdge[] {
  return edges.map(toReactFlowEdge)
}

/** store 当前全部 nodes/edges → react-flow 数据（单向桥渲染半程）。 */
export function snapshotToReactFlow(): { nodes: NomiReactFlowNode[]; edges: NomiReactFlowEdge[] } {
  const state = useGenerationCanvasStore.getState()
  return { nodes: toReactFlowNodes(state.nodes), edges: toReactFlowEdges(state.edges) }
}

/**
 * 桥入口：react-flow 的 onNodesChange → 回写 store。
 *
 * **拖拽性能策略（S2 STEP 2 修正）**：拖拽期间 react-flow 本地先动（onNodesChange 更新 rfNodes），
 * **不每帧写 store**（避免 store 更新风暴）；松手时 onNodeDragStop 经 applyDragSettledToStore 一次回写。
 * 故本函数**忽略 position change**（由 applyDragSettledToStore 处理），只处理 remove 等非拖拽变化。
 *
 * - remove change：store.deleteNode（删除应立即同步）。
 * - 其余变更（selection 等）不在此处理，选区由 store.selectedNodeIds 主导（react-flow 侧不持有真相）。
 */
export function applyNodeChangesToStore(changes: NodeChange<NomiReactFlowNode>[]): void {
  for (const change of changes) {
    if (change.type === 'remove') {
      useGenerationCanvasStore.getState().deleteNode(change.id)
    }
    // position change 在拖拽结束经 applyDragSettledToStore 一次回写（见容器 onNodeDragStop）。
  }
}

/**
 * 拖拽结束回写：react-flow onNodeDragStop → store.moveNode 最终绝对 position。
 * 在容器 onNodeDragStop 调用（松手一次）。moveNode 内部已 emit canvas.node.moved（canvasNodeActions.ts:158）。
 */
export function applyDragSettledToStore(nodeId: string, position: { x: number; y: number }): void {
  useGenerationCanvasStore.getState().moveNode(nodeId, position)
}

/** react-flow 的 onConnect（拖线放上目标）→ store.connectNodes。 */
export function applyConnectionToStore(connection: Connection): void {
  if (!connection.source || !connection.target) return
  useGenerationCanvasStore.getState().connectNodes(connection.source, connection.target)
}

/**
 * react-flow 的 onEdgesChange → 回写 store。
 * - remove change（选中边按 Delete / 删除键）→ store.disconnectEdge（含组 scope 语义，见 canvasGraphActions）。
 * - 其余变更（selection 等）由 react-flow 侧持有（边选区不落 store），在此不处理。
 */
export function applyEdgeChangesToStore(changes: import('@xyflow/react').EdgeChange<NomiReactFlowEdge>[]): void {
  for (const change of changes) {
    if (change.type === 'remove') {
      useGenerationCanvasStore.getState().disconnectEdge(change.id)
    }
  }
}

/** 边模式切换 → store.updateEdgeMode（自定义 Edge 内模式菜单触发）。 */
export function applyEdgeModeToStore(edgeId: string, mode: NonNullable<GenerationCanvasEdge['mode']>): void {
  useGenerationCanvasStore.getState().updateEdgeMode(edgeId, mode)
}

/** 断开边 → store.disconnectEdge（自定义 Edge 内模式菜单剪刀触发）。 */
export function applyDisconnectToStore(edgeId: string): void {
  useGenerationCanvasStore.getState().disconnectEdge(edgeId)
}
