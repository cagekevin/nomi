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
import { ReactFlow, ReactFlowProvider, useEdgesState, useNodesState, useReactFlow, Position, ConnectionLineType, ConnectionMode, type Connection, type NodeTypes, type EdgeTypes } from '@xyflow/react'
import '@xyflow/react/dist/style.css'
// 紧跟官方 style.css：覆盖 react-flow 强加给自定义节点 wrapper 的默认白底/边框/padding（见文件头注释）。
import '../styles/reactFlowOverrides.css'
import { cn } from '../../../utils/cn'
import { useGenerationCanvasStore } from '../store/generationCanvasStore'
import { useWorkbenchStore } from '../../workbenchStore'
import { ReactFlowNode } from '../nodes/ReactFlowNode'
import ReactFlowEdge from './ReactFlowEdge'
import CanvasToolbar, { NodeAddMenu } from './CanvasToolbar'
import { CanvasEmptyState } from './CanvasEmptyState'
import { completeNodeConnection } from '../nodes/completeNodeConnection'
import type { GenerationNodeKind } from '../model/generationCanvasTypes'
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
  canConnectNodes,
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
  // S4-B5：client → canvas 坐标换算（react-flow 官方，替代老画布 getCanvasPointFromClientPoint 自研换算）。
  // canvas → screen 用于菜单 DOM 定位（NodeAddMenu 是 absolute 屏幕定位，需相对容器的 screen 坐标）。
  const { screenToFlowPosition, flowToScreenPosition } = useReactFlow()

  // C1 左侧添加节点工具栏：挂容器，落点 = 视口锚（容器 38%/28% 处）→ screenToFlowPosition 转 canvas。
  // 对齐老画布 getToolbarInsertionPosition（GenerationCanvas.tsx:391-401，默认生成节点落上半区留 composer）。
  const canvasRef = React.useRef<HTMLDivElement | null>(null)
  const getInsertionPosition = React.useCallback(() => {
    const rect = canvasRef.current?.getBoundingClientRect()
    const anchor = rect ? { x: rect.left + rect.width * 0.38, y: rect.top + rect.height * 0.28 } : { x: 360, y: 280 }
    const point = screenToFlowPosition(anchor)
    return { x: Math.round(point.x), y: Math.round(point.y) }
  }, [screenToFlowPosition])

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

  // S4-D1 右键菜单（替代老画布 useCanvasContextNodeMenu 自研 pointer 仲裁，用官方 onNodeContextMenu/onPaneContextMenu）。
  // 老画布担心「macOS ctrl+click / 右键平移冲突」→ react-flow 官方事件已处理，不用自研排队仲裁。
  const [contextMenu, setContextMenu] = React.useState<{ canvasX: number; canvasY: number } | null>(null)

  // 右键菜单 window 级关闭监听（D4：pointerdown/Escape/blur 关闭，对齐老画布 GenerationCanvas.tsx:284-297）。
  React.useEffect(() => {
    if (!contextMenu) return undefined
    const close = () => setContextMenu(null)
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close()
    }
    window.addEventListener('pointerdown', close)
    window.addEventListener('keydown', handleKeyDown)
    window.addEventListener('blur', close)
    return () => {
      window.removeEventListener('pointerdown', close)
      window.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('blur', close)
    }
  }, [contextMenu])

  const handlePaneContextMenu = React.useCallback(
    (event: React.MouseEvent | MouseEvent) => {
      if (readOnly) return
      event.preventDefault()
      const point = screenToFlowPosition({ x: event.clientX, y: event.clientY })
      setContextMenu({ canvasX: Math.round(point.x), canvasY: Math.round(point.y) })
    },
    [readOnly, screenToFlowPosition],
  )

  const handleNodeContextMenu = React.useCallback(
    (event: React.MouseEvent, node: NomiReactFlowNode) => {
      if (readOnly) return
      event.preventDefault()
      // 节点上右键 → 在节点旁建新节点（落点 = 右键处 canvas 坐标，供 NodeAddMenu 建节点）。
      void node
      const point = screenToFlowPosition({ x: event.clientX, y: event.clientY })
      setContextMenu({ canvasX: Math.round(point.x), canvasY: Math.round(point.y) })
    },
    [readOnly, screenToFlowPosition],
  )

  const handleAddContextNode = React.useCallback(
    (kind: GenerationNodeKind) => {
      if (!contextMenu) return
      addNode({
        kind,
        position: { x: contextMenu.canvasX, y: contextMenu.canvasY },
        categoryId: activeCategoryId,
      })
      setContextMenu(null)
    },
    [activeCategoryId, addNode, contextMenu],
  )

  // —— S4-D2 放空菜单：拖线到空白处松手 → 弹「建什么节点」菜单，选后建新节点 + 自动连上源节点 ——
  const startConnection = useGenerationCanvasStore((state) => state.startConnection)
  const [connectionCreateMenu, setConnectionCreateMenu] = React.useState<{
    sourceNodeId: string
    sourceSide: 'left' | 'right'
    canvasX: number
    canvasY: number
  } | null>(null)

  // 放空菜单 window 级关闭监听（D4，对齐老画布 GenerationCanvas.tsx:299-316）。
  React.useEffect(() => {
    if (!connectionCreateMenu) return undefined
    const close = () => setConnectionCreateMenu(null)
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close()
    }
    window.addEventListener('pointerdown', close)
    window.addEventListener('keydown', handleKeyDown)
    window.addEventListener('blur', close)
    return () => {
      window.removeEventListener('pointerdown', close)
      window.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('blur', close)
    }
  }, [connectionCreateMenu])

  // onConnectEnd：拖线松手时触发。放空（toNode == null）且源节点可产媒体 → 弹建节点菜单。
  const handleConnectEnd = React.useCallback(
    (event: MouseEvent | TouchEvent, connectionState: import('@xyflow/react').FinalConnectionState) => {
      if (readOnly) return
      const fromNode = connectionState.fromNode
      const toNode = connectionState.toNode
      if (!fromNode || toNode) return // 非放空（有目标节点）→ 正常 onConnect 已建边
      const sourceNodeId = fromNode.id
      const sourceNode = useGenerationCanvasStore.getState().nodes.find((n) => n.id === sourceNodeId)
      if (!sourceNode) return
      // 只允许源节点能产媒体（对齐老画布 useDragToConnect.onDropOnEmpty 判定）。
      const sourceCanCreateMedia = sourceNode.kind === 'text' || sourceNode.kind === 'image' || sourceNode.kind === 'video'
      if (!sourceCanCreateMedia) return
      const point = screenToFlowPosition({ x: connectionState.from.x, y: connectionState.from.y })
      const sourceSide = connectionState.fromPosition === Position.Left ? 'left' : 'right'
      setConnectionCreateMenu({
        sourceNodeId,
        sourceSide,
        canvasX: Math.round(point.x),
        canvasY: Math.round(point.y),
      })
    },
    [readOnly, screenToFlowPosition],
  )

  const handleAddConnectedNode = React.useCallback(
    (kind: GenerationNodeKind) => {
      if (!connectionCreateMenu) return
      const { sourceNodeId, sourceSide, canvasX, canvasY } = connectionCreateMenu
      const created = addNode({
        kind,
        position: { x: canvasX, y: canvasY },
        categoryId: activeCategoryId,
        exactPosition: true,
        select: true,
      })
      // 复刻老画布 handleAddConnectedNode（GenerationCanvas.tsx:519-533）：startConnection + completeNodeConnection。
      startConnection(sourceNodeId, sourceSide)
      completeNodeConnection(created.id)
      setConnectionCreateMenu(null)
    },
    [activeCategoryId, addNode, connectionCreateMenu, startConnection],
  )

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
      <div ref={canvasRef} className="relative w-full h-full min-w-0 min-h-0">
        <ReactFlow
          nodes={rfNodes}
          edges={rfEdges}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          onNodesChange={handleNodesChange}
          onEdgesChange={handleEdgesChange}
          onConnect={handleConnect}
          onConnectEnd={handleConnectEnd}
          onNodeDragStop={handleNodeDragStop}
          onDrop={handleStageDrop}
          onDragOver={handleStageDragOver}
          onNodeContextMenu={handleNodeContextMenu}
          onPaneContextMenu={handlePaneContextMenu}
          // S4-F8（D11 方案 B）：拖线时 isValidConnection 校验，无效连线即时拦截 + 视觉反馈。
          isValidConnection={(connection) => canConnectNodes(connection.source, connection.target)}
          // S4-A4/A5/A6：react-flow 内建交互，显式配置对齐老画布行为——
          // 框选键 Shift（追加）、连线预览线贝塞尔（自研 rAF 预览线由 react-flow connection line 接管）。
          selectionKeyCode="Shift"
          connectionLineType={ConnectionLineType.Bezier}
          connectionMode={ConnectionMode.Loose}
          // S1 空容器不 fitView（初始 viewport {0,0,1}，保证 stage 坐标 == canvas 坐标）；
          // 自动 fit 是 S5（B3/G4）。
          fitView={false}
          minZoom={0.2}
          maxZoom={3}
          proOptions={{ hideAttribution: true }}
        />
        {!readOnly ? (
          <CanvasToolbar getInsertionPosition={getInsertionPosition} categoryId={activeCategoryId} />
        ) : null}
        {nodes.length === 0 ? (
          <CanvasEmptyState
            activeCategoryId={activeCategoryId}
            onCreate={() =>
              addNode({ kind: 'image', position: { x: 240, y: 240 }, categoryId: activeCategoryId, select: true })
            }
          />
        ) : null}
        {contextMenu ? (
          <NodeAddMenu
            className="generation-canvas-v2__context-node-menu z-[20] left-auto top-auto"
            style={(() => {
              const p = flowToScreenPosition({ x: contextMenu.canvasX, y: contextMenu.canvasY })
              return { left: p.x, top: p.y }
            })()}
            onPointerDown={(event) => event.stopPropagation()}
            onContextMenu={(event) => event.preventDefault()}
            onAddNode={handleAddContextNode}
          />
        ) : null}
        {connectionCreateMenu ? (
          <NodeAddMenu
            className="generation-canvas-v2__connection-create-menu z-[20] left-auto top-auto w-[132px]"
            style={(() => {
              const p = flowToScreenPosition({ x: connectionCreateMenu.canvasX, y: connectionCreateMenu.canvasY })
              return { left: p.x, top: p.y }
            })()}
            kinds={['image', 'video']}
            onPointerDown={(event) => event.stopPropagation()}
            onContextMenu={(event) => event.preventDefault()}
            onAddNode={handleAddConnectedNode}
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
