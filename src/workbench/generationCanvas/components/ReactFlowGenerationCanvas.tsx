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
import { ReactFlow, ReactFlowProvider, useEdgesState, useNodesState, useReactFlow, useOnViewportChange, useNodesInitialized, Position, ConnectionLineType, ConnectionMode, type Connection, type NodeTypes, type EdgeTypes, type Viewport } from '@xyflow/react'
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
import { ReactFlowGroupFrameOverlay } from './ReactFlowGroupFrameOverlay'
import { getCanvasGroupBoxes } from './generationCanvasGeometry'
import { CanvasNavigationStack } from './CanvasNavigationStack'
import { CanvasSelectionToolbar } from './CanvasSelectionToolbar'
import { CanvasBatchGenerateDock } from './CanvasBatchGenerateDock'
import { useTidyCanvas } from './useTidyCanvas'
import { useCanvasGroupActions } from './useCanvasGroupActions'
import { useCanvasProductionActions } from './useCanvasProductionActions'
import { useCanvasShortcuts } from './useCanvasShortcuts'
import { getSelectedBounds } from './generationCanvasGeometry'
import { NodeReadOnlyContext } from '../nodes/NodeReadOnlyContext'
import { FOCUS_GENERATION_NODE_EVENT, findTimelineDropTarget } from '../nodes/nodeSizing'
import { completeNodeConnection } from '../nodes/completeNodeConnection'
import { clientXToFrame } from '../../timeline/timelineEdit'
import { buildGenerationNodeTimelineClip } from '../../timeline/buildGenerationNodeTimelineClip'
import { getTrackTypeForClipType } from '../../timeline/timelineTypes'
import { toast } from '../../../ui/toast'
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

/** S6-C3 多选工具条定位常量（对齐老画布 GenerationCanvas.tsx:73，选区上方偏移）。 */
const MULTI_SELECTION_TOOLBAR_OFFSET = 58

/**
 * S4-F9 拖线命中组框空白（组内非节点区域）→ 返回 groupId，否则 null。
 * 复刻老画布 useDragToConnect.findConnectionTargetGroupId（纯函数：elementsFromPoint + [data-group-id]）。
 * 优先级：节点 > 组框空白 > 画布空白（react-flow onConnectEnd 里 toNode!=null 已先走节点，这里只补组框）。
 */
function findConnectionTargetGroupId(clientX: number, clientY: number): string | null {
  for (const hit of document.elementsFromPoint(clientX, clientY)) {
    const groupId = hit.closest<HTMLElement>('[data-group-id]')?.dataset.groupId
    if (groupId) return groupId
  }
  return null
}

/** S1 容器：包 ReactFlowProvider，供后续 screenToFlowPosition 等（S4/S5）。 */
function ReactFlowGenerationCanvasInner({ readOnly = false }: { readOnly?: boolean }): JSX.Element {
  const { t } = useTranslation()
  const isReady = useGenerationCanvasStore((state) => state.isReady)
  const markReady = useGenerationCanvasStore((state) => state.markReady)
  const allNodes = useGenerationCanvasStore((state) => state.nodes)
  const allEdges = useGenerationCanvasStore((state) => state.edges)
  const groups = useGenerationCanvasStore((state) => state.groups)
  const pendingConnectionSourceId = useGenerationCanvasStore((state) => state.pendingConnectionSourceId)
  const pendingConnectionSourceSide = useGenerationCanvasStore((state) => state.pendingConnectionSourceSide)
  const connectToGroup = useGenerationCanvasStore((state) => state.connectToGroup)
  const addNode = useGenerationCanvasStore((state) => state.addNode)
  const activeCategoryId = useWorkbenchStore((state) => state.activeCategoryId)
  // S4-B5：client → canvas 坐标换算（react-flow 官方，替代老画布 getCanvasPointFromClientPoint 自研换算）。
  // canvas → screen 用于菜单 DOM 定位（NodeAddMenu 是 absolute 屏幕定位，需相对容器的 screen 坐标）。
  const { screenToFlowPosition, flowToScreenPosition, setViewport, fitView, zoomTo, zoomIn, zoomOut, setCenter } = useReactFlow()

  // S5-B1 变换同步（react-flow → store）：react-flow viewport 为运行时真源，store.canvasZoom/Offset 仅镜像。
  // onChange 平移节流 100ms 写 store（防每帧 store 风暴，老画布 useCanvasTransformStoreSync 同思想）；
  // onEnd 即时落定。回环 guard：写前比较旧值，值未变则跳过（防 store→react-flow 的 setViewport 又写回）。
  // S5-B2 多分类 viewport 记忆（workbenchStore，复用老画布 useCanvasViewport 语义）：
  // onEnd 松手才记（避免每帧写）；切分类时读记忆 setViewport 恢复，无记忆则 fitView（B3）。
  const categoryViewports = useWorkbenchStore((state) => state.categoryViewports)
  const rememberCategoryViewport = useWorkbenchStore((state) => state.rememberCategoryViewport)
  const lastCategoryRef = React.useRef(activeCategoryId)
  const nodesInitialized = useNodesInitialized()
  // 审计遗漏点 5：订阅 canvasFitNonce（requestCanvasFit 发的一次性 fit 信号），变化即平滑 fit 揭示新节点。
  // 消费端补在 react-flow 容器；ref 记录上次 nonce，跳过首帧（nonce=0）避免首屏误 fit。
  const canvasFitNonce = useWorkbenchStore((state) => state.canvasFitNonce)
  const lastFitNonceRef = React.useRef(canvasFitNonce)

  const setCanvasTransform = useGenerationCanvasStore((state) => state.setCanvasTransform)
  const lastSyncedViewportRef = React.useRef<Viewport>({ x: 0, y: 0, zoom: 1 })
  const panSyncTimerRef = React.useRef<number | null>(null)
  const writeTransformToStore = React.useCallback(
    (viewport: Viewport) => {
      const { canvasZoom, canvasOffset } = useGenerationCanvasStore.getState()
      if (canvasZoom === viewport.zoom && canvasOffset.x === viewport.x && canvasOffset.y === viewport.y) return
      lastSyncedViewportRef.current = viewport
      setCanvasTransform(viewport.zoom, { x: viewport.x, y: viewport.y })
    },
    [setCanvasTransform],
  )
  // useOnViewportChange 的回调经 store.setState 注册，闭包不随每次渲染刷新——用 ref 持最新分类/记忆。
  const viewportCtxRef = React.useRef({ rememberCategoryViewport, lastCategoryRef })
  viewportCtxRef.current = { rememberCategoryViewport, lastCategoryRef }
  useOnViewportChange({
    onChange: (viewport) => {
      // 平移节流：缩放即时，平移 100ms 一拍（onEnd 会即时落定，过程只是让 store 不太滞后）。
      if (viewport.zoom !== lastSyncedViewportRef.current.zoom) {
        writeTransformToStore(viewport)
        return
      }
      if (panSyncTimerRef.current !== null) return
      panSyncTimerRef.current = window.setTimeout(() => {
        panSyncTimerRef.current = null
        writeTransformToStore(viewport)
      }, 100)
    },
    onEnd: (viewport) => {
      if (panSyncTimerRef.current !== null) {
        window.clearTimeout(panSyncTimerRef.current)
        panSyncTimerRef.current = null
      }
      writeTransformToStore(viewport)
      // B2：松手记当前分类的 viewport（记忆源在 workbenchStore，react-flow 侧状态不落 generationCanvasStore）。
      viewportCtxRef.current.rememberCategoryViewport(viewportCtxRef.current.lastCategoryRef.current, {
        zoom: viewport.zoom,
        offset: { x: viewport.x, y: viewport.y },
      })
    },
  })

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

  // S4-F9 组框：groups + 分类过滤后的 nodes → getCanvasGroupBoxes 得 flow 坐标组框（纯函数，复用老画布）。
  // 组框层用 useViewport 同步 transform（ReactFlowGroupFrameOverlay 内），随画布缩放对齐节点。
  const groupBoxes = React.useMemo(() => getCanvasGroupBoxes(groups, nodes), [groups, nodes])

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
      // S4-F9 连到整组：放空落在组框空白 → 组内每成员一根边。优先级对齐老画布（节点 > 组框 > 空白），
      // 必须在「弹新建节点菜单」之前判组框（否则组内空白会被当画布空白）。用真实 client 坐标命中
      // [data-group-id]（elementsFromPoint 需屏幕坐标，不是 connectionState.from 手柄位置）。
      // connectToGroup 依赖 pendingConnectionSourceId（读 pending 物化），故先 startConnection 设 pending，
      // 再 connectToGroup（同 S4-D2 handleAddConnectedNode 的 startConnection+complete 模式）。
      const clientX = 'clientX' in event ? event.clientX : 0
      const clientY = 'clientY' in event ? event.clientY : 0
      const targetGroupId = findConnectionTargetGroupId(clientX, clientY)
      if (targetGroupId) {
        const sourceSide = connectionState.fromPosition === Position.Left ? 'left' : 'right'
        startConnection(sourceNodeId, sourceSide)
        connectToGroup(targetGroupId)
        return
      }
      const point = screenToFlowPosition({ x: connectionState.from.x, y: connectionState.from.y })
      const sourceSide = connectionState.fromPosition === Position.Left ? 'left' : 'right'
      setConnectionCreateMenu({
        sourceNodeId,
        sourceSide,
        canvasX: Math.round(point.x),
        canvasY: Math.round(point.y),
      })
    },
    [readOnly, screenToFlowPosition, startConnection, connectToGroup],
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
  // 拖拽竞态保护（审计改坏点 4）：拖拽期间（onNodeDrag* / onSelectionDrag* 进行中）跳过全量重映射——
  // react-flow 本地持有拖拽中的 position，store→react-flow 覆盖会把正在拖的节点弹回拖前值。
  // 松手 onNodeDragStop/onSelectionDragStop 先把最终位置回写 store，之后重映射读到的就是新位置。
  const isDraggingRef = React.useRef(false)
  React.useEffect(() => {
    if (isDraggingRef.current) return
    setRfNodes(toReactFlowNodes(nodes))
    setRfEdges(toReactFlowEdges(edges))
  }, [nodes, edges, setRfEdges, setRfNodes])

  // S5-B2/B3：切分类 → 记旧分类 viewport，恢复新分类记忆或首载 fitView。
  // 只在分类确实变化时触发（lastCategoryRef 对照），避免首次渲染误恢复。
  React.useEffect(() => {
    if (lastCategoryRef.current === activeCategoryId) return
    // 旧分类的 viewport 由 B1 onEnd 已记过（松手即记）；这里只在切换瞬间兜底补记一次。
    rememberCategoryViewport(lastCategoryRef.current, {
      zoom: lastSyncedViewportRef.current.zoom,
      offset: { x: lastSyncedViewportRef.current.x, y: lastSyncedViewportRef.current.y },
    })
    const remembered = categoryViewports[activeCategoryId]
    if (remembered) {
      setViewport({ x: remembered.offset.x, y: remembered.offset.y, zoom: remembered.zoom }, { duration: 0 })
    } else if (nodesInitialized) {
      // 无记忆（首载/新分类）→ 自动 fit（B3）。
      void fitView({ padding: 0.2, duration: 0 })
    }
    lastCategoryRef.current = activeCategoryId
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeCategoryId, nodesInitialized])

  // 审计遗漏点 5 消费端：requestCanvasFit bump nonce → 容器平滑 fit 揭示新节点（Agent 建节点 / 落画布 / 素材定位等）。
  React.useEffect(() => {
    if (canvasFitNonce === lastFitNonceRef.current) return
    lastFitNonceRef.current = canvasFitNonce
    if (nodesInitialized) void fitView({ padding: 0.2, duration: 300 })
  }, [canvasFitNonce, fitView, nodesInitialized])

  // S5-C5 minimap + 缩放条：复用老画布 CanvasNavigationStack（纯 props 驱动）。
  // 坐标源 = store.canvasZoom/Offset（B1 已同步 react-flow viewport 镜像）+ 容器尺寸。
  const canvasZoom = useGenerationCanvasStore((state) => state.canvasZoom)
  const canvasOffset = useGenerationCanvasStore((state) => state.canvasOffset)
  const selectedNodeIds = useGenerationCanvasStore((state) => state.selectedNodeIds)
  const [stageSize, setStageSize] = React.useState<{ width: number; height: number }>({ width: 0, height: 0 })
  React.useEffect(() => {
    const el = canvasRef.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const update = () => setStageSize({ width: el.clientWidth, height: el.clientHeight })
    update()
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  const [minimapVisible, setMinimapVisible] = React.useState(true)
  const { tidy } = useTidyCanvas(activeCategoryId)
  const handleJumpToCanvasPoint = React.useCallback(
    (point: { x: number; y: number }) => {
      // minimap 点/拖 → 把视口中心跳到该 canvas 点（保持当前 zoom）。
      setCenter(point.x, point.y, { zoom: lastSyncedViewportRef.current.zoom })
    },
    [setCenter],
  )
  const handleFitView = React.useCallback(() => {
    void fitView({ padding: 0.2, duration: 0 })
  }, [fitView])
  const handleResetView = React.useCallback(() => {
    setViewport({ x: 0, y: 0, zoom: 1 }, { duration: 0 })
  }, [setViewport])
  const handleZoomTo = React.useCallback(
    (nextZoom: number) => {
      zoomTo(nextZoom, { duration: 0 })
    },
    [zoomTo],
  )
  const handleTidy = React.useCallback(() => {
    tidy(1.8)
  }, [tidy])

  // S6-C3 多选工具条：selectedGroupIds 派生（groups 里成员全部被选）+ selectedBounds（flow 坐标，定位用）。
  const selectedGroupIds = React.useMemo(
    () =>
      groups
        .filter((group) => {
          const memberIds = group.nodeIds.filter((nodeId) => nodes.some((n) => n.id === nodeId))
          return memberIds.length > 0 && memberIds.every((id) => selectedNodeIds.includes(id))
        })
        .map((group) => group.id),
    [groups, nodes, selectedNodeIds],
  )
  const selectedBounds = React.useMemo(() => getSelectedBounds(nodes, selectedNodeIds), [nodes, selectedNodeIds])

  // S6-E1 成组 + E2 批量（纯 store，复用）。
  const groupActions = useCanvasGroupActions({ activeCategoryId, selectedGroupIds, selectedNodeIds })
  const production = useCanvasProductionActions({ activeCategoryId, selectedNodeIds })

  // S6-C3 定位：flow 坐标 → 容器内屏幕坐标（flowToScreenPosition 是视口绝对，需减容器 origin）。
  const selectionToolbarStyle = React.useMemo(() => {
    if (selectedNodeIds.length <= 1 || !selectedBounds) return null
    const cx = selectedBounds.minX + selectedBounds.width / 2
    const topY = selectedBounds.minY - MULTI_SELECTION_TOOLBAR_OFFSET
    const screen = flowToScreenPosition({ x: cx, y: topY })
    const rect = canvasRef.current?.getBoundingClientRect()
    if (!rect) return null
    return { left: screen.x - rect.left, top: screen.y - rect.top }
  }, [selectedNodeIds.length, selectedBounds, flowToScreenPosition])

  // S6-G2 聚焦：FOCUS_GENERATION_NODE_EVENT → 切分类 + selectNode + setCenter 定位。
  React.useEffect(() => {
    const handleFocusNode = (event: Event) => {
      const detail = (event as CustomEvent<{ nodeId?: unknown }>).detail
      const nodeId = typeof detail?.nodeId === 'string' ? detail.nodeId : ''
      if (!nodeId) return
      const target = useGenerationCanvasStore.getState().nodes.find((n) => n.id === nodeId)
      if (!target) return
      const targetCategoryId = target.categoryId || 'shots'
      useWorkbenchStore.getState().setActiveCategoryId(targetCategoryId)
      useGenerationCanvasStore.getState().selectNode(nodeId)
      const size = useGenerationCanvasStore.getState().canvasZoom || 1
      void setCenter(target.position.x + (target.size?.width ?? 220) / 2, target.position.y + (target.size?.height ?? 120) / 2, { zoom: size })
    }
    window.addEventListener(FOCUS_GENERATION_NODE_EVENT, handleFocusNode)
    return () => window.removeEventListener(FOCUS_GENERATION_NODE_EVENT, handleFocusNode)
  }, [setCenter])

  // S6-D5 快捷键：复用老画布 useCanvasShortcuts（业务键 Cmd+C/X/V/Z、Cmd+G 成组、Escape 清选区等）。
  // delete 由 react-flow 内建 deleteKeyCode 处理（onNodesChange remove → store.deleteNode，已接通），
  // useCanvasShortcuts 不重复处理删除。stageRef 换容器 canvasRef（判画布隐藏守卫，评审点 5 真机验）。
  const deleteSelectedNodes = useGenerationCanvasStore((state) => state.deleteSelectedNodes)
  const copySelectedNodes = useGenerationCanvasStore((state) => state.copySelectedNodes)
  const cutSelectedNodes = useGenerationCanvasStore((state) => state.cutSelectedNodes)
  const pasteNodes = useGenerationCanvasStore((state) => state.pasteNodes)
  const cancelConnection = useGenerationCanvasStore((state) => state.cancelConnection)
  const undo = useGenerationCanvasStore((state) => state.undo)
  const redo = useGenerationCanvasStore((state) => state.redo)
  useCanvasShortcuts({
    readOnly,
    stageRef: canvasRef,
    selectedNodeCount: selectedNodeIds.length,
    selectedGroupCount: selectedGroupIds.length,
    activeCategoryId,
    setActiveEdge: () => {}, // react-flow 无边选中态（边选区在 react-flow 侧），置空。
    cancelConnection,
    deleteSelectedNodes,
    groupSelectedNodes: groupActions.handleGroupSelectedNodes,
    ungroupSelectedNodes: groupActions.handleUngroupSelectedNodes,
    copySelectedNodes,
    cutSelectedNodes,
    pasteNodes,
    getPastePosition: getInsertionPosition,
    zoomByStep: (direction) => {
      if (direction > 0) void zoomIn({ duration: 0 })
      else void zoomOut({ duration: 0 })
    },
    undo,
    redo,
  })

  // 回写半程：react-flow 事件 → 桥 → store。
  const handleNodesChange = React.useCallback(
    (changes: Parameters<typeof onNodesChange>[0]) => {
      onNodesChange(changes) // 先本地响应（拖拽流畅）
      applyNodeChangesToStore(changes) // 回写 store（真相源）；position 拖拽中不回写（见桥注释）
    },
    [onNodesChange],
  )

  // 拖拽结束：一次回写最终 position + undo 入栈（moveNode 内部已 emit canvas.node.moved）。
  // 审计改坏点 3：拖节点到时间轴建 clip。react-flow 节点拖拽是 pointer 事件，不走时间轴 HTML5
  // drop（onDrop 接不到），故这里复用老 useNodeDragResize.handlePointerUp 的 findTimelineDropTarget
  // 命中判定：松手点落在时间轴轨道 DOM 上 → 用光标处帧建 clip；节点已有生成结果才建（无结果 toast 提示）。
  const handleTimelineDropOnDragStop = React.useCallback(
    (point: { clientX: number; clientY: number }, node: NomiReactFlowNode) => {
      const droppedOverTimeline = findTimelineDropTarget(point.clientX, point.clientY)
      if (!droppedOverTimeline) return
      const nomiNode = node.data?.nomiNode
      if (!nomiNode?.result?.url) {
        toast(t('generationCommon.node.generateBeforeTimeline'), 'info')
        return
      }
      const timeline = useWorkbenchStore.getState().timeline
      const liveNode =
        useGenerationCanvasStore.getState().nodes.find((candidate) => candidate.id === node.id) || nomiNode
      const rect = droppedOverTimeline.getBoundingClientRect()
      const startFrame = clientXToFrame(point.clientX, rect.left, timeline.scale)
      void buildGenerationNodeTimelineClip(liveNode, { fps: timeline.fps, startFrame }).then((clip) => {
        if (!clip) return
        useWorkbenchStore.getState().addTimelineClipAtFrame(clip, getTrackTypeForClipType(clip.type), startFrame)
        // 建 clip 后把节点挪回原位（对齐老逻辑，避免建 clip 时节点已被拖离原位）。
        const origin = node.data?.nomiNode?.position
        if (origin) useGenerationCanvasStore.getState().moveNode(node.id, origin, { persist: false, emit: false })
      })
    },
    [t],
  )

  const handleNodeDragStart = React.useCallback(() => {
    isDraggingRef.current = true
  }, [])

  const handleNodeDragStop = React.useCallback(
    (event: MouseEvent | TouchEvent, node: NomiReactFlowNode) => {
      isDraggingRef.current = false
      // OnNodeDrag 的 event 是原生 DOM event；TouchEvent 无 clientX（touches），仅 MouseEvent 判定时间轴。
      if ('clientX' in event) handleTimelineDropOnDragStop(event, node)
      applyDragSettledToStore(node.id, node.position)
      useGenerationCanvasStore.getState().commitPersistedChange()
    },
    [handleTimelineDropOnDragStop],
  )

  // 审计改坏点 1：多选拖拽（框选后拖多节点）触发 onSelectionDrag*，与 onNodeDrag* 互斥——
  // 原只挂 onNodeDragStop，多选松手不回写 store，下次重映射整组弹回。这里补 onSelectionDragStop：
  // 逐个把 react-flow 拖后的绝对 position 回写 store（applyDragSettledToStore 一次一个）+ persist。
  const handleSelectionDragStart = React.useCallback(() => {
    isDraggingRef.current = true
  }, [])

  const handleSelectionDragStop = React.useCallback((_event: React.MouseEvent, nodes: NomiReactFlowNode[]) => {
    isDraggingRef.current = false
    // 多选拖拽只回写位置，不建时间轴 clip（多选拖到时间轴属边缘场景，老逻辑"当前节点"语义难对齐）。
    nodes.forEach((dragNode) => {
      applyDragSettledToStore(dragNode.id, dragNode.position)
    })
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
      // 审计改坏点 2：S5 已接入变换同步（useOnViewportChange → store.canvasZoom/Offset），
      // viewport 不再恒为 {0,0,1}。drop 落点换算必须用真实 offset/zoom，否则缩放/平移后拖入素材错位。
      handleCanvasStageDrop(event, { readOnly, offset: canvasOffset, zoom: canvasZoom || 1, activeCategoryId })
    },
    [activeCategoryId, canvasOffset, canvasZoom, readOnly],
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
        {/* S6-readOnly 透传：Provider 把容器 readOnly 传给 ReactFlowNode（NodeProps 不携带）。 */}
        <NodeReadOnlyContext.Provider value={readOnly}>
        <ReactFlow
          nodes={rfNodes}
          edges={rfEdges}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          onNodesChange={handleNodesChange}
          onEdgesChange={handleEdgesChange}
          onConnect={handleConnect}
          onConnectEnd={handleConnectEnd}
          onNodeDragStart={handleNodeDragStart}
          onNodeDragStop={handleNodeDragStop}
          onSelectionDragStart={handleSelectionDragStart}
          onSelectionDragStop={handleSelectionDragStop}
          onDrop={handleStageDrop}
          onDragOver={handleStageDragOver}
          onNodeContextMenu={handleNodeContextMenu}
          onPaneContextMenu={handlePaneContextMenu}
          // S4-F8（D11 方案 B）：拖线时 isValidConnection 校验，无效连线即时拦截 + 视觉反馈。
          isValidConnection={(connection) => canConnectNodes(connection.source, connection.target)}
          // S4-A4/A5/A6：react-flow 内建交互，显式配置对齐老画布行为——
          // 框选键 Shift（追加）、连线预览线贝塞尔（自研 rAF 预览线由 react-flow connection line 接管）。
          selectionKeyCode="Shift"
          // S6-D5 删除键：react-flow 内建（对齐老画布 Delete）。onNodesChange remove → store.deleteNode 已接通。
          deleteKeyCode="Delete"
          connectionLineType={ConnectionLineType.Bezier}
          connectionMode={ConnectionMode.Loose}
          // S1 空容器不 fitView（初始 viewport {0,0,1}，保证 stage 坐标 == canvas 坐标）；
          // 自动 fit 是 S5（B3/G4）。
          fitView={false}
          // S5-F7 LOD：react-flow 内建虚拟化，只渲染视口可见节点/边（替代老画布手写裁剪），大画布自动生效。
          onlyRenderVisibleElements
          minZoom={0.2}
          maxZoom={3}
          proOptions={{ hideAttribution: true }}
        />
        {/* S4-F9 组框层：useViewport 同步 transform，随画布缩放对齐节点（评审点 3：z-0 置于节点之下，不挡拖拽）。 */}
        <ReactFlowGroupFrameOverlay
          boxes={groupBoxes}
          pendingConnection={!readOnly && Boolean(pendingConnectionSourceId)}
          pendingConnectionSide={pendingConnectionSourceSide}
          onConnectToGroup={(groupId) => {
            // 拖线命中组框空白已由 handleConnectEnd 设了 pending（startConnection），这里补一道：
            // 若无 pending（如非拖线触发）则安全返回，connectToGroup 内部会 clearPending。
            connectToGroup(groupId)
          }}
        />
        {/* S5-C5 左下 minimap + 缩放条：复用老画布 CanvasNavigationStack（纯 props），坐标来自 store（B1 同步）。 */}
        <CanvasNavigationStack
          readOnly={readOnly}
          nodes={nodes}
          selectedIds={new Set(selectedNodeIds)}
          zoom={canvasZoom || 1}
          zoomPercent={Math.round((canvasZoom || 1) * 100)}
          offset={canvasOffset}
          stageSize={stageSize}
          minimapVisible={minimapVisible}
          onToggleMinimap={() => setMinimapVisible((v) => !v)}
          onJumpToCanvasPoint={handleJumpToCanvasPoint}
          onFitView={handleFitView}
          onResetView={handleResetView}
          onZoomTo={handleZoomTo}
          onTidy={handleTidy}
        />
        {/* S6-C3 多选工具条：>1 选中且定位有效时显示，定位在选区上方（容器内屏幕坐标）。 */}
        {selectionToolbarStyle && !readOnly ? (
          <CanvasSelectionToolbar
            selectedCount={selectedNodeIds.length}
            selectedGroupCount={selectedGroupIds.length}
            transform={`translate(${Math.round(selectionToolbarStyle.left)}px, ${Math.round(selectionToolbarStyle.top)}px) translateX(-50%)`}
            eligibleCount={production.eligibleIds.length}
            executionGroups={production.executionGroups}
            concurrency={production.concurrency}
            contactSheetCount={groupActions.contactSheetCount}
            onConcurrencyChange={production.setConcurrency}
            onGenerate={production.generate}
            onApplyModel={production.applyModel}
            onGroupSelectedNodes={groupActions.handleGroupSelectedNodes}
            onUngroupSelectedNodes={groupActions.handleUngroupSelectedNodes}
            onBuildContactSheet={groupActions.handleBuildContactSheet}
            onClearSelection={() => useGenerationCanvasStore.getState().selectNodes([])}
          />
        ) : null}
        {/* S6-C4 批量 dock：底部居中（对齐老画布，无选中时按分类 scope）。 */}
        {!readOnly ? (
          <CanvasBatchGenerateDock
            eligibleIds={production.eligibleIds}
            concurrency={production.concurrency}
            setConcurrency={production.setConcurrency}
            generate={production.generate}
          />
        ) : null}
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
        </NodeReadOnlyContext.Provider>
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
