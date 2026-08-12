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

export type NomiReactFlowNode = Node<NomiNodeData>
export type NomiReactFlowEdge = Edge & { nomiEdge?: GenerationCanvasEdge }

/** store 的 GenerationCanvasNode → react-flow Node（业务字段整包进 data）。 */
export function toReactFlowNode(node: GenerationCanvasNode): NomiReactFlowNode {
  return {
    id: node.id,
    position: { x: node.position.x, y: node.position.y },
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
 * 桥的唯一入口：react-flow 的 onNodesChange → 回写 store。
 *
 * POC 只处理两件事（最小闭环）：position 变更（拖拽）与删除。
 * - position change：react-flow 给绝对 position → store.moveNode 绝对位置。
 * - remove change：store.deleteNode。
 * 其余变更（selection 等）不在此处理，选区由 store.selectedNodeIds 主导（react-flow 侧不持有真相）。
 *
 * 注意：拖拽期间的中间帧（dragging=true）也应回写，保证 store 是实时真相；
 * 但高频 move 的 rAF 批处理在容器 onNodeDrag 层做（见 ReactFlowGenerationCanvas），本桥只做单次语义。
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
