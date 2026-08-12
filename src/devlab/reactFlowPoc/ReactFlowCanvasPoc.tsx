// POC 渲染 demo：react-flow 渲染 Nomi store 的 nodes/edges，交互经桥回写 store。
//
// 单向数据流桥（store 为真相源）：
//   渲染半程：store 订阅（subscribeWithSelector）→ toReactFlowNodes/Edges → <ReactFlow nodes/edges>
//   回写半程：react-flow onNodesChange/onConnect → 桥纯函数 → store actions
//
// 放在 devlab（内部实验区），不接入主画布路由，验证数据流桥成立即达 POC 目的。
//
// POC 升级前置（S1）：此前只验 position/remove/connect 空盒子、且「挂载快照一次 + 手动刷新」——
// 未订阅 store 变更。这里改为订阅 state.nodes/edges 驱动 react-flow（生产桥雏形），
// 并带最小真实内容层节点（PocNode）验证「store 变 → 节点内容跟着变」的完整闭环。
import React from 'react'
import {
  Background,
  Controls,
  MiniMap,
  ReactFlow,
  useEdgesState,
  useNodesState,
  type Connection,
  type NodeProps,
  type NodeTypes,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { useGenerationCanvasStore } from '../../workbench/generationCanvas/store/generationCanvasStore'
import {
  applyConnectionToStore,
  applyNodeChangesToStore,
  toReactFlowEdges,
  toReactFlowNodes,
  type NomiReactFlowEdge,
  type NomiReactFlowNode,
} from './bridge'

/** POC 最小真实内容层节点：展示 store 里 nomiNode 的 title/kind/position，验证内容层随 store 更新。 */
function PocNode({ data }: NodeProps<NomiReactFlowNode>): JSX.Element {
  const nomiNode = data.nomiNode
  return (
    <div
      style={{
        width: 220,
        padding: 12,
        border: '1px solid #888',
        borderRadius: 8,
        background: '#fff',
        color: '#111',
        font: '12px/1.4 system-ui, sans-serif',
        boxShadow: '0 2px 6px rgba(0,0,0,0.15)',
      }}
    >
      <div style={{ fontWeight: 700, marginBottom: 4 }}>
        {nomiNode.title || `(no title, id=${nomiNode.id})`}
      </div>
      <div style={{ opacity: 0.7 }}>kind: {nomiNode.kind}</div>
      <div style={{ opacity: 0.7 }}>
        pos: {Math.round(nomiNode.position.x)}, {Math.round(nomiNode.position.y)}
      </div>
    </div>
  )
}

const nodeTypes: NodeTypes = {
  default: PocNode,
}

function ReactFlowCanvasPocInner(): JSX.Element {
  const [rfNodes, setRfNodes, onNodesChange] = useNodesState<NomiReactFlowNode>([])
  const [rfEdges, setRfEdges, onEdgesChange] = useEdgesState<NomiReactFlowEdge>([])

  // 渲染半程：订阅 store.nodes/edges，任一变化 → 全量重算 react-flow 数据（闭环核心）。
  // 生产版会做引用稳定 + 最小 diff（S5 LOD），此处 POC 全量重算证明「订阅驱动」成立。
  const storeNodes = useGenerationCanvasStore((state) => state.nodes)
  const storeEdges = useGenerationCanvasStore((state) => state.edges)
  React.useEffect(() => {
    setRfNodes(toReactFlowNodes(storeNodes))
    setRfEdges(toReactFlowEdges(storeEdges))
  }, [storeNodes, storeEdges])

  // 回写半程：react-flow 事件 → 桥 → store。
  const handleNodesChange = React.useCallback(
    (changes: Parameters<typeof onNodesChange>[0]) => {
      onNodesChange(changes) // 先让 react-flow 本地响应（拖拽流畅）
      applyNodeChangesToStore(changes) // 再回写 store（真相源）→ 订阅把最新 store 投影回来
    },
    [onNodesChange],
  )

  const handleConnect = React.useCallback((connection: Connection) => {
    applyConnectionToStore(connection)
  }, [])

  const handleAddNode = React.useCallback(() => {
    useGenerationCanvasStore.getState().addNode({
      kind: 'image',
      title: `新节点 ${String(Math.random()).slice(2, 5)}`,
      position: { x: 200 + Math.random() * 200, y: 100 + Math.random() * 200 },
      categoryId: 'shots',
    })
  }, [])

  return (
    <div style={{ width: '100%', height: '80vh', display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <span style={{ fontWeight: 600 }}>POC: react-flow ↔ Nomi store 单向数据流桥（订阅驱动）</span>
        <button onClick={handleAddNode}>+ 加节点(store.addNode)</button>
      </div>
      <div style={{ flex: 1, border: '1px solid #888' }}>
        <ReactFlow
          nodes={rfNodes}
          edges={rfEdges}
          nodeTypes={nodeTypes}
          onNodesChange={handleNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={handleConnect}
          fitView
        >
          <Background />
          <Controls />
          <MiniMap />
        </ReactFlow>
      </div>
    </div>
  )
}

export function ReactFlowCanvasPoc(): JSX.Element {
  return <ReactFlowCanvasPocInner />
}
