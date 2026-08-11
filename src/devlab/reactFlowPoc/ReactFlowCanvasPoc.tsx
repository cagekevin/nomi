// POC 渲染 demo：react-flow 渲染 Nomi store 的 nodes/edges，交互经桥回写 store。
//
// 单向数据流桥（store 为真相源）：
//   渲染半程：store 订阅 → snapshotToReactFlow() → <ReactFlow nodes/edges>
//   回写半程：react-flow onNodesChange/onConnect → bridge 纯函数 → store actions
//
// 放在 devlab（内部实验区），不接入主画布路由，验证数据流桥成立即达 POC 目的。
import React from 'react'
import {
  Background,
  Controls,
  MiniMap,
  ReactFlow,
  useEdgesState,
  useNodesState,
  type Connection,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { useGenerationCanvasStore } from '../../workbench/generationCanvas/store/generationCanvasStore'
import {
  applyConnectionToStore,
  applyNodeChangesToStore,
  type NomiReactFlowEdge,
  type NomiReactFlowNode,
} from './bridge'

function ReactFlowCanvasPocInner(): JSX.Element {
  const [rfNodes, setRfNodes, onNodesChange] = useNodesState<NomiReactFlowNode>([])
  const [rfEdges, setRfEdges, onEdgesChange] = useEdgesState<NomiReactFlowEdge>([])

  // 渲染半程：store 订阅，store 一变 → 重算 react-flow 数据。
  useGenerationCanvasStore((state) => state.nodes)
  useGenerationCanvasStore((state) => state.edges)
  React.useEffect(() => {
    const state = useGenerationCanvasStore.getState()
    setRfNodes(state.nodes.map((n) => ({ id: n.id, position: n.position, data: { nomiNode: n } })))
    setRfEdges(
      state.edges.map((e) => ({
        id: e.id,
        source: e.source,
        target: e.target,
        nomiEdge: e,
      })),
    )
  }, []) // POC 简化：挂载时快照一次 + 下方 add 按钮主动刷新。完整版应订阅 store 变更（见 bridge.snapshotToReactFlow）。

  // 回写半程：react-flow 事件 → 桥 → store。
  const handleNodesChange = React.useCallback(
    (changes: Parameters<typeof onNodesChange>[0]) => {
      onNodesChange(changes) // 先让 react-flow 本地响应（拖拽流畅）
      applyNodeChangesToStore(changes) // 再回写 store（真相源）
    },
    [onNodesChange],
  )

  const handleConnect = React.useCallback(
    (connection: Connection) => {
      applyConnectionToStore(connection)
      // 重新快照回 store 最新边（store 是唯一真相连边逻辑，react-flow 不自建）
      const state = useGenerationCanvasStore.getState()
      setRfEdges(state.edges.map((e) => ({ id: e.id, source: e.source, target: e.target, nomiEdge: e })))
    },
    [setRfEdges],
  )

  const handleAddNode = React.useCallback(() => {
    const created = useGenerationCanvasStore.getState().addNode({
      kind: 'image',
      position: { x: 200 + Math.random() * 200, y: 100 + Math.random() * 200 },
      categoryId: 'shots',
    })
    const state = useGenerationCanvasStore.getState()
    setRfNodes(state.nodes.map((n) => ({ id: n.id, position: n.position, data: { nomiNode: n } })))
    void created
  }, [setRfNodes])

  return (
    <div style={{ width: '100%', height: '80vh', display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <span style={{ fontWeight: 600 }}>POC: react-flow ↔ Nomi store 单向数据流桥</span>
        <button onClick={handleAddNode}>+ 加节点(store.addNode)</button>
      </div>
      <div style={{ flex: 1, border: '1px solid #888' }}>
        <ReactFlow
          nodes={rfNodes}
          edges={rfEdges}
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
