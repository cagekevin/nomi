// ReactFlowGenerationCanvas — S1 容器骨架（react-flow 渲染层容器）。
//
// 单向数据流桥：store 为真相源 → 订阅驱动 react-flow nodes/edges；交互经桥回写 store。
// 依赖方向：container → bridge → store actions（单向，红线）。
//
// S1 范围（见 plan §三 S1）：A3（pan/zoom 内建）+ G1（就绪标记）+ G3（导入/桥订阅收口）
// + C2（空态 CTA）+ D3（拖拽导入）。
// S2 才接真实内容层节点（BaseGenerationNode nodeTypes）；本阶段用最简卡片渲染，验证桥闭环。
import React from 'react'
import { useTranslation } from 'react-i18next'
import { ReactFlow, ReactFlowProvider, useEdgesState, useNodesState, type Connection, type NodeTypes, type EdgeTypes } from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { cn } from '../../../utils/cn'
import { useGenerationCanvasStore } from '../store/generationCanvasStore'
import { useWorkbenchStore } from '../../workbenchStore'
import { ReactFlowNode } from '../nodes/ReactFlowNode'
import ReactFlowEdge from './ReactFlowEdge'
import { CanvasEmptyState } from './CanvasEmptyState'
import { WORKSPACE_FILE_DRAG_MIME } from '../../explorer/workspaceFileDrag'
import { ASSET_LIBRARY_DRAG_MIME } from '../../assets/assetLibraryDrag'
import {
  BROWSER_ASSET_DRAG_MIME,
  LEGACY_BROWSER_ASSET_DRAG_MIME,
  handleCanvasStageDrop,
} from './canvasStageDrop'
import {
  applyConnectionToStore,
  applyDragSettledToStore,
  applyEdgeChangesToStore,
  applyNodeChangesToStore,
  toReactFlowEdges,
  toReactFlowNodes,
  type NomiReactFlowEdge,
  type NomiReactFlowNode,
} from '../bridge/renderFlowBridge'

const nodeTypes: NodeTypes = {
  default: ReactFlowNode,
}

const edgeTypes: EdgeTypes = {
  default: ReactFlowEdge,
}

/** S1 容器：包 ReactFlowProvider，供后续 screenToFlowPosition 等（S4/S5）。 */
function ReactFlowGenerationCanvasInner({ readOnly = false }: { readOnly?: boolean }): JSX.Element {
  const { t } = useTranslation()
  const isReady = useGenerationCanvasStore((state) => state.isReady)
  const markReady = useGenerationCanvasStore((state) => state.markReady)
  const allNodes = useGenerationCanvasStore((state) => state.nodes)
  const allEdges = useGenerationCanvasStore((state) => state.edges)
  const addNode = useGenerationCanvasStore((state) => state.addNode)
  const activeCategoryId = useWorkbenchStore((state) => state.activeCategoryId)

  // 分类过滤：节点无 categoryId 时回退到 project default（shots），与老画布一致（GenerationCanvas.tsx:90-96）。
  const nodes = React.useMemo(() => {
    if (!activeCategoryId) return allNodes
    return allNodes.filter((node) => (node.categoryId || 'shots') === activeCategoryId)
  }, [allNodes, activeCategoryId])

  const edges = React.useMemo(() => {
    const visibleIds = new Set(nodes.map((n) => n.id))
    return allEdges.filter((edge) => visibleIds.has(edge.source) && visibleIds.has(edge.target))
  }, [allEdges, nodes])

  const [rfNodes, setRfNodes, onNodesChange] = useNodesState<NomiReactFlowNode>([])
  const [rfEdges, setRfEdges, onEdgesChange] = useEdgesState<NomiReactFlowEdge>([])

  // 就绪标记（G1）：容器挂载即 ready（老画布 GenerationCanvas.tsx:197-199 同语义）。
  React.useEffect(() => {
    markReady()
  }, [markReady])

  // 渲染半程：订阅 store nodes/edges（分类过滤后）→ react-flow 数据（单向桥闭环核心）。
  React.useEffect(() => {
    setRfNodes(toReactFlowNodes(nodes))
    setRfEdges(toReactFlowEdges(edges))
  }, [nodes, edges, setRfEdges, setRfNodes])

  // 回写半程：react-flow 事件 → 桥 → store。
  const handleNodesChange = React.useCallback(
    (changes: Parameters<typeof onNodesChange>[0]) => {
      onNodesChange(changes) // 先本地响应（拖拽流畅）
      applyNodeChangesToStore(changes) // 回写 store（真相源）；position 拖拽中不回写（见桥注释）
    },
    [onNodesChange],
  )

  // 拖拽结束：一次回写最终 position + undo 入栈（moveNode 内部已 emit canvas.node.moved）。
  const handleNodeDragStop = React.useCallback((_event: unknown, node: NomiReactFlowNode) => {
    applyDragSettledToStore(node.id, node.position)
    useGenerationCanvasStore.getState().commitPersistedChange()
  }, [])

  const handleConnect = React.useCallback((connection: Connection) => {
    applyConnectionToStore(connection)
  }, [])

  // 边变更回写：remove（选中边按 Delete）→ store.disconnectEdge；selection 不落 store（react-flow 侧持有）。
  const handleEdgesChange = React.useCallback(
    (changes: Parameters<typeof onEdgesChange>[0]) => {
      onEdgesChange(changes) // 先本地响应（删除即时）
      applyEdgeChangesToStore(changes) // 回写 store（真相源）
    },
    [onEdgesChange],
  )

  const handleStageDrop = React.useCallback(
    (event: React.DragEvent<HTMLDivElement>) => {
      // S1 未做变换同步（B1 是 S5），react-flow 初始 viewport 保持 {0,0,1}，
      // 故 stage 坐标 == canvas 坐标。S5 接入变换同步后再喂真实 offset/zoom。
      handleCanvasStageDrop(event, { readOnly, offset: { x: 0, y: 0 }, zoom: 1, activeCategoryId })
    },
    [activeCategoryId, readOnly],
  )

  const handleStageDragOver = React.useCallback(
    (event: React.DragEvent<HTMLDivElement>) => {
      if (readOnly) return
      const types = Array.from(event.dataTransfer.types)
      if (
        types.includes('Files') ||
        types.includes(WORKSPACE_FILE_DRAG_MIME) ||
        types.includes(ASSET_LIBRARY_DRAG_MIME) ||
        types.includes(BROWSER_ASSET_DRAG_MIME) ||
        types.includes(LEGACY_BROWSER_ASSET_DRAG_MIME)
      ) {
        event.preventDefault()
        event.dataTransfer.dropEffect = 'copy'
      }
    },
    [readOnly],
  )

  return (
    <section
      className={cn(
        'generation-canvas-v2',
        'grid grid-rows-[minmax(0,1fr)] w-full h-full min-w-0 min-h-0 bg-workbench-bg text-workbench-ink',
      )}
      aria-label={t('generationCommon.canvas.aria')}
      data-ready={isReady ? 'true' : undefined}
      data-nomi-generation-canvas-import-target={!readOnly ? 'true' : undefined}
    >
      <div className="relative w-full h-full min-w-0 min-h-0">
        <ReactFlow
          nodes={rfNodes}
          edges={rfEdges}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          onNodesChange={handleNodesChange}
          onEdgesChange={handleEdgesChange}
          onConnect={handleConnect}
          onNodeDragStop={handleNodeDragStop}
          onDrop={handleStageDrop}
          onDragOver={handleStageDragOver}
          // S1 空容器不 fitView（初始 viewport {0,0,1}，保证 stage 坐标 == canvas 坐标）；
          // 自动 fit 是 S5（B3/G4）。
          fitView={false}
          minZoom={0.2}
          maxZoom={3}
          proOptions={{ hideAttribution: true }}
        />
        {nodes.length === 0 ? (
          <CanvasEmptyState
            activeCategoryId={activeCategoryId}
            onCreate={() =>
              addNode({ kind: 'image', position: { x: 240, y: 240 }, categoryId: activeCategoryId, select: true })
            }
          />
        ) : null}
      </div>
    </section>
  )
}

export function ReactFlowGenerationCanvas({ readOnly = false }: { readOnly?: boolean }): JSX.Element {
  return (
    <ReactFlowProvider>
      <ReactFlowGenerationCanvasInner readOnly={readOnly} />
    </ReactFlowProvider>
  )
}

export default ReactFlowGenerationCanvas
