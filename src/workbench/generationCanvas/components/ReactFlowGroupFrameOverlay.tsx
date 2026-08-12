// ReactFlowGroupFrameOverlay — react-flow 容器内的组框渲染层（S4-F9）。
//
// 目的：把组框（GroupFrameList）渲染进 react-flow 的 viewport 变换层，随画布平移/缩放对齐节点。
// react-flow 节点在 `.react-flow__viewport`（transform: translate+scale）内用 flow 坐标定位；
// 组框同用 flow 坐标（store 语义不变，plan §四.5 铁律），故用 `useViewport()` 拿 {x,y,zoom}
// 手动套 `translate(x,y) scale(zoom)`，让组框层与节点同坐标系、随画布缩放（评审点 3 z-index 处理：
// 组框层 z-0，置于节点之下，不挡节点拖拽）。
//
// 消费方（容器）喂 boxes + pendingConnection + onConnectToGroup：
//   boxes  = getCanvasGroupBoxes(groups, nodes)（纯函数，flow 坐标）
//   pending = store.pendingConnectionSourceId（拖线时有 pending → 组框变落点）
//   onConnectToGroup = 拖线命中组框空白 → store.connectToGroup（见容器 onConnectEnd）
//
// 依赖方向：overlay → bridge/store（单向，辅助 UI 挂容器，plan 域 C 🟢 适配）。
import React from 'react'
import { useViewport } from '@xyflow/react'
import { GroupFrameList, type CanvasGroupBox } from './GroupFrame'
import type { ConnectionAnchorSide } from '../store/canvasStoreTypes'

type ReactFlowGroupFrameOverlayProps = {
  boxes: readonly CanvasGroupBox[]
  /** 拖线进行中（有 pendingConnectionSourceId）→ 组框变可落点（连到整组）。 */
  pendingConnection: boolean
  pendingConnectionSide: ConnectionAnchorSide
  /** 拖线落在组框空白 → 连到整组（组内每成员一根边）。 */
  onConnectToGroup: (groupId: string) => void
}

export function ReactFlowGroupFrameOverlay({
  boxes,
  pendingConnection,
  pendingConnectionSide,
  onConnectToGroup,
}: ReactFlowGroupFrameOverlayProps): JSX.Element | null {
  // 同步 react-flow viewport 变换，让组框层与节点层对齐（react-flow 侧状态，不写 store——B1 变换同步归 S5）。
  const { x, y, zoom } = useViewport()
  if (!boxes.length) return null
  return (
    <div
      className="pointer-events-none absolute inset-0 z-0"
      style={{ transform: `translate(${x}px, ${y}px) scale(${zoom})`, transformOrigin: '0 0' }}
      aria-hidden
    >
      <GroupFrameList
        boxes={boxes}
        pendingConnection={pendingConnection}
        pendingConnectionSide={pendingConnectionSide}
        onConnectToGroup={onConnectToGroup}
        // S4 不做组框拖动/选中（plan §五 边界，S6 多选工具条一起）。onPointerDown 传空，仅保类型。
        onPointerDown={() => {}}
      />
    </div>
  )
}

export default ReactFlowGroupFrameOverlay
