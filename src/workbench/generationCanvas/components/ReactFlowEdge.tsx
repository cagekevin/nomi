// ReactFlowEdge — react-flow 自定义边（S3，从零按官方方式建，平移老画布 CanvasEdgeLayer 语义）。
//
// 老画布 CanvasEdgeLayer.tsx 的边渲染逻辑，按 react-flow 官方机制重写：
// - 几何：getBezierPath（react-flow 按节点实际渲染尺寸算锚点，替代自算贝塞尔）
// - mode 样式：读 data.nomiEdge.mode → data-mode 驱动 CSS（复用 generationCanvas.css 边类，视觉一致）
// - 边标签门（2026-08-08 拍板）：**选中节点才浮出关联边类型标签**；非 reference mode 才标
// - 模式菜单：点标签展开 availableEdgeModes(source, target) → updateEdgeMode
// - 断开：菜单剪刀 → disconnectEdge
// - 边选中态：react-flow EdgeProps.selected（react-flow 侧状态）
//
// store 为唯一真相源：本组件只读 selectedNodeIds/nodes，交互经桥回写 store（单向，红线）。
import React from 'react'
import { useTranslation } from 'react-i18next'
import { BaseEdge, EdgeLabelRenderer, getBezierPath, type EdgeProps } from '@xyflow/react'
import { IconCheck, IconChevronDown, IconScissors } from '@tabler/icons-react'
import { cn } from '../../../utils/cn'
import { useGenerationCanvasStore } from '../store/generationCanvasStore'
import { availableEdgeModes } from './edgeModeMenu'
import {
  applyDisconnectToStore,
  applyEdgeModeToStore,
  type NomiReactFlowEdge,
} from '../bridge/renderFlowBridge'

export type NomiEdgeProps = EdgeProps<NomiReactFlowEdge>

/** 单条边：贝塞尔路径 + 点亮/淡化 + 标签门 + 模式菜单/断开。memo 防止无关边重渲。 */
function ReactFlowEdge({
  id,
  source,
  target,
  selected,
  data,
  ...pathProps
}: NomiEdgeProps): JSX.Element {
  const { t } = useTranslation()
  const nomiEdge = data?.nomiEdge
  const mode = nomiEdge?.mode ?? 'reference'
  const isTyped = mode !== 'reference'

  // 边标签门：**选中节点才浮出关联边类型标签**（老画布 CanvasEdgeLayer 语义，2026-08-08 拍板）。
  // selectedNodeIds 由 store 主导（react-flow 侧不持有节点选区真相）。
  const selectedNodeIds = useGenerationCanvasStore((state) => state.selectedNodeIds)
  const nodes = useGenerationCanvasStore((state) => state.nodes)
  const isIncident = selectedNodeIds.includes(source) || selectedNodeIds.includes(target)

  const [edgePath, labelX, labelY] = getBezierPath(pathProps)
  const sourceNode = nodes.find((n) => n.id === source)
  const targetNode = nodes.find((n) => n.id === target)

  // react-flow 边选中态（selected prop）驱动点亮；关联到选中节点也点亮（对齐老画布 data-incident）。
  const lit = selected || isIncident
  const selectableModes = sourceNode && targetNode ? availableEdgeModes(sourceNode, targetNode) : []

  // 模式菜单打开态：react-flow edge 用 selected 表示「被点中」，点标签展开菜单。
  const [menuOpen, setMenuOpen] = React.useState(false)

  if (!sourceNode || !targetNode) {
    // 缺端点节点（删除/未就绪）：画一条原始贝塞尔，不渲染交互层。
    return <BaseEdge id={id} path={edgePath} />
  }

  const modeLabel = t(`generationCommon.canvas.edge.modes.${mode}`)
  const sourceTitle = sourceNode.title
  const targetTitle = targetNode.title

  return (
    <>
      <g
        className="generation-canvas-v2__edge"
        data-mode={mode}
        data-edge-id={id}
        data-active={selected ? 'true' : undefined}
        data-incident={isIncident ? 'true' : undefined}
      >
        <BaseEdge
          id={id}
          path={edgePath}
          interactionWidth={20}
          className={cn(
            'generation-canvas-v2__edge-path',
            lit ? 'generation-canvas-v2__edge-path--lit' : '',
          )}
          aria-label={t('generationCommon.canvas.edge.select', {
            source: sourceTitle,
            target: targetTitle,
          })}
          style={lit ? { strokeOpacity: 1 } : undefined}
        />
      </g>
      {/* 标签只给「选中节点的边」和「正在改模式的那条边」；非 reference 才有类型标签。 */}
      {isTyped && (lit || menuOpen) ? (
        <EdgeLabelRenderer>
          <div
            className="pointer-events-none absolute nodrag nopan"
            style={{
              left: labelX,
              top: labelY,
              transform: 'translate(-50%, -50%)',
            }}
            data-edge-id={id}
          >
            {menuOpen ? (
              <div
                className="pointer-events-auto z-[2] flex w-[184px] flex-col rounded-nomi border border-nomi-line bg-nomi-paper p-1 shadow-nomi-md"
                role="menu"
                aria-label={t('generationCommon.canvas.edge.modeMenu')}
                onPointerDown={(event) => event.stopPropagation()}
                onKeyDown={(event) => {
                  if (event.key === 'Escape') setMenuOpen(false)
                }}
              >
                <button
                  type="button"
                  className="inline-flex h-6 items-center gap-1 rounded-pill border border-nomi-accent/40 bg-nomi-paper px-2 text-caption font-semibold leading-none whitespace-nowrap text-nomi-accent shadow-nomi-sm"
                  aria-haspopup="menu"
                  aria-expanded="true"
                  aria-label={t('generationCommon.canvas.edge.changeMode', { mode: modeLabel })}
                  onClick={(event) => {
                    event.stopPropagation()
                    setMenuOpen(false)
                  }}
                >
                  {modeLabel}
                  <IconChevronDown size={12} stroke={1.8} className="rotate-180" aria-hidden="true" />
                </button>
                {selectableModes.map((candidateMode) => {
                  const candidateLabel = t(`generationCommon.canvas.edge.modes.${candidateMode}`)
                  const isSelectedMode = candidateMode === mode
                  return (
                    <button
                      key={candidateMode}
                      type="button"
                      role="menuitemradio"
                      aria-checked={isSelectedMode}
                      className={cn(
                        'flex h-8 w-full items-center gap-2 rounded-nomi-sm border-0 px-2.5 text-left text-caption cursor-pointer',
                        isSelectedMode
                          ? 'bg-nomi-accent-soft text-nomi-accent'
                          : 'bg-transparent text-nomi-ink-80 hover:bg-nomi-ink-05 hover:text-nomi-ink',
                      )}
                      onClick={(event) => {
                        event.stopPropagation()
                        applyEdgeModeToStore(id, candidateMode)
                        setMenuOpen(false)
                      }}
                    >
                      <span className="flex-1">{candidateLabel}</span>
                      {isSelectedMode ? <IconCheck size={14} stroke={2} aria-hidden="true" /> : null}
                    </button>
                  )
                })}
                <div className="my-1 h-px bg-nomi-line" aria-hidden="true" />
                <button
                  type="button"
                  role="menuitem"
                  className="flex h-8 w-full items-center gap-2 rounded-nomi-sm border-0 bg-transparent px-2.5 text-caption text-workbench-danger cursor-pointer hover:bg-workbench-danger-soft"
                  aria-label={t('generationCommon.canvas.edge.disconnect', {
                    source: sourceTitle,
                    target: targetTitle,
                  })}
                  title={t('generationCommon.canvas.edge.disconnectMode', { mode: modeLabel })}
                  onClick={(event) => {
                    event.stopPropagation()
                    applyDisconnectToStore(id)
                    setMenuOpen(false)
                  }}
                >
                  <IconScissors size={14} stroke={1.8} aria-hidden="true" />
                  {t('generationCommon.canvas.edge.disconnectAction')}
                </button>
              </div>
            ) : (
              <button
                type="button"
                className="generation-canvas-v2__edge-tag-pill pointer-events-auto inline-flex h-6 items-center gap-1 rounded-pill border border-nomi-accent/40 bg-nomi-paper px-2 text-caption font-semibold leading-none whitespace-nowrap text-nomi-accent shadow-nomi-sm cursor-pointer"
                aria-label={t('generationCommon.canvas.edge.changeMode', { mode: modeLabel })}
                onClick={(event) => {
                  event.stopPropagation()
                  setMenuOpen(true)
                }}
              >
                {modeLabel}
                <IconChevronDown size={12} stroke={1.8} aria-hidden="true" />
              </button>
            )}
          </div>
        </EdgeLabelRenderer>
      ) : null}
    </>
  )
}

export default React.memo(ReactFlowEdge)
