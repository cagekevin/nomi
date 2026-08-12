// ReactFlowNode — react-flow 自定义节点（S2 STEP 1，从零按官方方式建，不背老画布壳包袱）。
//
// 目标（用户拍板）：安全过渡到 react-flow，功能逐个按官方机制迁移。老画布（BaseGenerationNode）
// 是过渡产品，S7 删。本节点从零消费 NodeProps + store，不依赖 BaseGenerationNode 的 952 行自研壳。
//
// S2 阶段能力（按功能迁移映射表 STEP 1-4）：
// - 渲染节点基础信息 + 状态（title/kind/status/progress）
// - NodeResizer 缩放（react-flow 官方）
// - 内容层按 kind 分发（audio/text/image/video）
// - 浮动工具条（STEP 4）：NodeToolbar 包图片/视频/结果下载浮条（positionMode="inline" 复用纯按钮）
// - 预留 Handle 骨架（连线在 S4 接）
// - 内容层（media/composer/参数条）后续按官方机制（NodeToolbar 等）逐步扩展
import React from 'react'
import { Handle, NodeResizer, NodeToolbar, Position, type NodeProps } from '@xyflow/react'
import { cn } from '../../../utils/cn'
import { lazyWithChunkBoundary } from '../../../ui/chunkBoundary'
import { useGenerationCanvasStore } from '../store/generationCanvasStore'
import { resolveNodeVisualSize } from './nodeSizing'
import { regenerateNodeInPlace } from '../runner/generationRunController'
import type { NomiReactFlowNode } from '../bridge/renderFlowBridge'
import AudioStripNode from './render/AudioStripNode'
import { DeferredNodeImage } from './DeferredNodeMedia'
import { NodeVideoPlaybackGuard } from './NodeVideoPlaybackGuard'
import { NodeInlineImageTitle } from './NodeImagePreviewActions'
import NodeImageEditToolbar from './NodeImageEditToolbar'
import NodeResultDownloadButton from './NodeResultDownloadButton'
import { useNodeImageEditing } from './useNodeImageEditing'
import { applyFixationMakeup } from '../fixation/buildFixationNode'
import NodeMediaPreviewDialog from './NodeMediaPreviewDialog'
import ProvenancePanel from './ProvenancePanel'
import {
  isAudioLikeGenerationNodeKind,
  isImageLikeGenerationNodeKind,
  isVideoLikeGenerationNodeKind,
} from '../model/generationNodeKinds'

const NodeGenerationComposer = lazyWithChunkBoundary('节点生成面板', () => import('./NodeGenerationComposer'))

/** 节点状态徽标文案映射（skeleton，内容层细化在后续 STEP）。 */
const STATUS_TEXT: Record<string, string> = {
  idle: '',
  queued: '排队中',
  running: '生成中…',
  success: '',
  error: '失败',
  recoverable: '可重试',
}

/**
 * 节点内容层按 kind 分发（S2 STEP 2，复用老画布引擎无关的 body，按 code-explorer 判定表）：
 * - audio/text：AudioStripNode（可直接复用，seek 归一化坐标，无自研 DOM 契约）
 * - image：DeferredNodeImage 媒体预览 + NodeInlineImageTitle 内联标题（均无画布 DOM 耦合，可直接复用）
 * - 其余 kind：先占位，后续 STEP 逐个接入（可复用的搬 / 需小改的删 DOM 契约 / 必须重写的按官方机制）
 */
function renderNodeBody(node: NomiReactFlowNode['data']['nomiNode'], selected: boolean): JSX.Element {
  if (isAudioLikeGenerationNodeKind(node.kind)) {
    return <AudioStripNode node={node} />
  }
  if (isVideoLikeGenerationNodeKind(node.kind)) {
    const videoUrl = node.result?.url
    if (!videoUrl) {
      return (
        <div className="flex h-[120px] flex-col items-center justify-center gap-1 bg-workbench-bg/40 px-3 text-caption text-nomi-ink-60">
          <span>内容层（{node.kind}，S2 后续 STEP 接入）</span>
          <span className="opacity-60">{node.prompt ? '· 有 prompt ·' : '· 空节点 ·'}</span>
        </div>
      )
    }
    return (
      <div className="relative aspect-video w-full overflow-hidden bg-workbench-bg/40">
        <NodeVideoPlaybackGuard nodeId={node.id} rawUrl={videoUrl} className="h-full w-full object-contain" />
        <NodeInlineImageTitle nodeId={node.id} value={node.title || node.id} selected={selected} />
      </div>
    )
  }
  if (isImageLikeGenerationNodeKind(node.kind)) {
    const imageUrl = node.result?.url || node.result?.thumbnailUrl
    if (!imageUrl) {
      return (
        <div className="flex h-[120px] flex-col items-center justify-center gap-1 bg-workbench-bg/40 px-3 text-caption text-nomi-ink-60">
          <span>内容层（{node.kind}，S2 后续 STEP 接入）</span>
          <span className="opacity-60">{node.prompt ? '· 有 prompt ·' : '· 空节点 ·'}</span>
        </div>
      )
    }
    return (
      <div className="relative h-[140px] w-full overflow-hidden bg-workbench-bg/40">
        <DeferredNodeImage
          src={imageUrl}
          alt={node.title || node.id}
          className="h-full w-full object-cover"
          placeholderClassName="bg-workbench-bg/40"
        />
        <NodeInlineImageTitle nodeId={node.id} value={node.title || node.id} selected={selected} />
      </div>
    )
  }
  return (
    <div className="flex h-[120px] flex-col items-center justify-center gap-1 bg-workbench-bg/40 px-3 text-caption text-nomi-ink-60">
      <span>内容层（{node.kind}，S2 后续 STEP 接入）</span>
      <span className="opacity-60">{node.prompt ? '· 有 prompt ·' : '· 空节点 ·'}</span>
    </div>
  )
}

export function ReactFlowNode({ data, selected, dragging }: NodeProps<NomiReactFlowNode>): JSX.Element {
  const node = data.nomiNode
  const status = node.status ?? 'idle'
  const visualSize = React.useMemo(() => resolveNodeVisualSize(node), [node])

  // —— S2 STEP 4 浮动工具条依赖（引擎无关，直接复用老画布 handler）——
  // 图片编辑状态机（裁剪/切图/变换/抠图）：纯 store + canvas 像素操作，无老画布 DOM/scale 耦合。
  const imageEditing = useNodeImageEditing(node, visualSize)
  // 生成记录面板开关。
  const [provenanceOpen, setProvenanceOpen] = React.useState(false)
  // 全屏预览（NodeMediaPreviewDialog）：portal 到 .workbench-generation__canvas（react-flow 容器仍挂其内）。
  const [mediaPreviewOpen, setMediaPreviewOpen] = React.useState(false)
  const previewUrl = node.result?.url
  const previewType = node.result?.type === 'image' || node.result?.type === 'video' ? node.result.type : undefined
  const openMediaPreview = React.useCallback(() => setMediaPreviewOpen(true), [])
  const closeMediaPreview = React.useCallback(() => setMediaPreviewOpen(false), [])

  const isRemoveBackgroundPending =
    (node.status === 'queued' || node.status === 'running') && node.progress?.phase === 'remove-background'
  const isImageResult = node.kind !== 'panorama' && node.result?.type === 'image' && Boolean(node.result.url)

  return (
    <>
      {/* composer（react-flow 官方 NodeToolbar Bottom，S2 STEP 3）：
          NodeToolbar 不随 viewport 缩放（官方实现），默认节点选中显示、多选隐藏（自动处理）。
          composer 用 positionMode="inline"（NodeToolbar 提供恒定尺寸定位，官方建议）。 */}
      <NodeToolbar position={Position.Bottom} offset={12} isVisible={selected}>
        <React.Suspense fallback={null}>
          <NodeGenerationComposer node={node} visualSize={visualSize} positionMode="inline" />
        </React.Suspense>
      </NodeToolbar>

      {/* 浮动工具条（react-flow 官方 NodeToolbar Top，S2 STEP 4）：生成后操作。
          NodeToolbar 提供恒定屏幕尺寸定位；浮条组件 positionMode="inline" 只复用纯按钮（ToolbarButton 等），
          不走老画布 FloatingToolbarShell 的反缩放定位（D1 定案废弃）。 */}
      {node.prompt || isImageResult || node.result?.url ? (
        <NodeToolbar position={Position.Top} offset={12} isVisible={selected}>
          <React.Suspense fallback={null}>
            <div className="flex items-center gap-1 rounded-nomi border border-nomi-line bg-nomi-paper px-1.5 py-1 shadow-nomi-md">
              {/* 图片结果 → 图片编辑浮条（裁剪/AI编辑/画板/下载/生成记录）。 */}
              {isImageResult ? (
                <NodeImageEditToolbar
                  node={node}
                  editGrid={imageEditing.editGrid}
                  imageOpBusy={imageEditing.imageOpBusy}
                  onMakeup={() => applyFixationMakeup(node)}
                  onGridSplit={(gridSize) => imageEditing.openEdit(gridSize)}
                  onCrop={() => imageEditing.openEdit(1)}
                  onTransform={(op) => void imageEditing.handleImageTransform(op)}
                  onRemoveBackground={() => void imageEditing.handleRemoveBackground()}
                  removeBackgroundBusy={isRemoveBackgroundPending}
                  onPreview={openMediaPreview}
                  onOpenProvenance={() => setProvenanceOpen(true)}
                  positionMode="inline"
                />
              ) : null}
              {/* 视频/其它非图片结果 → 下载/抽帧浮条（NodeResultDownloadButton 内部按结果类型分发）。
                  图片结果已走 NodeImageEditToolbar，这里跳过避免重复。 */}
              {!isImageResult ? (
                <NodeResultDownloadButton
                  node={node}
                  selected={selected}
                  onPreview={openMediaPreview}
                  onOpenProvenance={() => setProvenanceOpen(true)}
                  positionMode="inline"
                />
              ) : null}
              {node.prompt ? (
                <>
                  <div className="mx-1 h-5 w-px bg-nomi-line" aria-hidden />
                  <button
                    type="button"
                    className="rounded-nomi px-2 py-0.5 text-caption text-nomi-ink transition-colors hover:bg-nomi-accent/10 hover:text-nomi-accent"
                    onClick={() => {
                      void regenerateNodeInPlace(node.id)
                    }}
                  >
                    重新生成
                  </button>
                </>
              ) : null}
            </div>
          </React.Suspense>
        </NodeToolbar>
      ) : null}

      {/* 全屏媒体预览 + 生成记录（fixed/portal 全屏，与画布定位无关，放 NodeToolbar 外）。 */}
      {mediaPreviewOpen && previewUrl && previewType ? (
        <NodeMediaPreviewDialog mediaType={previewType} url={previewUrl} title={node.title || node.id} onClose={closeMediaPreview} />
      ) : null}
      <ProvenancePanel node={node} open={provenanceOpen} onClose={() => setProvenanceOpen(false)} />

      <div
        className={cn(
          'generation-canvas-v2-node',
          'relative rounded-nomi border bg-nomi-paper shadow-nomi-md',
          'text-body-sm text-nomi-ink',
          selected && 'border-nomi-accent ring-2 ring-nomi-accent/30',
          dragging && 'opacity-70',
        )}
        data-node-id={node.id}
        style={{ width: node.size?.width ?? 220 }}
      >
      {/* 8 向缩放（react-flow 官方，替代自研 resize 热区）。
          媒体节点（image/video）开 keepAspectRatio 等比锁（react-flow 内置，等价老画布 meta 比例锁——
          节点初始尺寸即按预览比例算，当前比例锁 = 保持初始正确比例）。
          onResizeEnd 松手一次回写 store.size（真相源），避免缩放中每帧写 store。 */}
      <NodeResizer
        isVisible={selected}
        minWidth={120}
        minHeight={80}
        keepAspectRatio={isImageLikeGenerationNodeKind(node.kind) || isVideoLikeGenerationNodeKind(node.kind)}
        lineClassName="border-nomi-accent"
        handleClassName="bg-nomi-accent"
        onResizeEnd={(_event, params) => {
          useGenerationCanvasStore.getState().updateNode(node.id, {
            size: { width: params.width, height: params.height },
          })
        }}
      />

      {/* 连线手柄骨架（S4 接入完整连接语义，先占位防止未来 break） */}
      <Handle type="target" position={Position.Left} className="!bg-nomi-accent" />
      <Handle type="source" position={Position.Right} className="!bg-nomi-accent" />

      {/* 节点头部 */}
      <div className="flex items-start justify-between gap-2 border-b border-nomi-line px-3 py-2">
        <div className="min-w-0">
          <div className="truncate font-medium">{node.title || node.id}</div>
          <div className="text-caption text-nomi-ink-60">{node.kind}</div>
        </div>
        {STATUS_TEXT[status] ? (
          <span
            className={cn(
              'shrink-0 rounded-nomi px-1.5 py-0.5 text-caption',
              status === 'error' && 'bg-red-50 text-red-600',
              status === 'running' && 'bg-blue-50 text-blue-600',
              status === 'queued' && 'bg-amber-50 text-amber-700',
            )}
          >
            {STATUS_TEXT[status]}
          </span>
        ) : null}
      </div>

      {/* 节点主体：按 kind 分发内容层 */}
      <div className="w-full">{renderNodeBody(node, selected)}</div>

      {/* 状态行（progress 骨架） */}
      {status === 'running' && node.progress ? (
        <div className="h-1 w-full overflow-hidden rounded-b-nomi bg-workbench-bg">
          <div
            className="h-full bg-nomi-accent transition-[width]"
            style={{ width: `${node.progress.percent ?? 0}%` }}
          />
        </div>
      ) : null}
      </div>
    </>
  )
}

export default ReactFlowNode
