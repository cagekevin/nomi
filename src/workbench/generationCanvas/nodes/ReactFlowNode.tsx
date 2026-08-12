// ReactFlowNode — react-flow 自定义节点（S2 STEP 1，从零按官方方式建，不背老画布壳包袱）。
//
// 目标（用户拍板）：安全过渡到 react-flow，功能逐个按官方机制迁移。老画布（BaseGenerationNode）
// 是过渡产品，S7 删。本节点从零消费 NodeProps + store，不依赖 BaseGenerationNode 的 952 行自研壳。
//
// S2 阶段能力（按功能迁移映射表 STEP 1-4）：
// - 渲染节点基础信息 + 状态（title/kind/status/progress）
// - NodeResizer 缩放（react-flow 官方）
// - 内容层按 kind 分发（audio/text/image/video/panorama）
// - 浮动工具条（STEP 4）：NodeToolbar 包图片/视频/结果下载/全景浮条（positionMode="inline" 复用纯按钮）
// - 预留 Handle 骨架（连线在 S4 接）
// - 内容层（media/composer/参数条）后续按官方机制（NodeToolbar 等）逐步扩展
import React from 'react'
import { useTranslation } from 'react-i18next'
import { Handle, NodeResizer, NodeToolbar, Position, type NodeProps } from '@xyflow/react'
import { IconDownload, IconMaximize } from '@tabler/icons-react'
import { cn } from '../../../utils/cn'
import { lazyWithChunkBoundary } from '../../../ui/chunkBoundary'
import { useGenerationCanvasStore } from '../store/generationCanvasStore'
import { resolveNodeVisualSize } from './nodeSizing'
import { confirmAndRunNode, regenerateNodeInPlace } from '../runner/generationRunController'
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
import PanoramaUploadFallback from './PanoramaUploadFallback'
import ImageCropGridOverlay, { type CropGridResult, type CropGridSize } from './render/ImageCropGridOverlay'
import { ImageResultStackControls } from './ImageResultStack'
import { useNodePanoramaHandlers } from './useNodePanoramaHandlers'
import { useResultDownload } from './useResultDownload'
import { NodeCardBody } from './render/NodeCardBody'
import { NodeErrorReport } from './NodeErrorReport'
import { resolveNodeRenderKind, isCardRenderKind } from './resolveRenderKind'
import {
  FloatingToolbarShell,
  TOOLBAR_ICON as TBI,
  ToolbarButton,
  ToolbarProvenanceButton,
} from './NodeFloatingToolbar'
import {
  isAudioLikeGenerationNodeKind,
  isImageLikeGenerationNodeKind,
  isVideoLikeGenerationNodeKind,
} from '../model/generationNodeKinds'

const NodeGenerationComposer = lazyWithChunkBoundary('节点生成面板', () => import('./NodeGenerationComposer'))
const PanoramaViewer = lazyWithChunkBoundary('全景预览', () => import('./PanoramaViewer'))
const TextDocumentNode = lazyWithChunkBoundary('文本节点编辑器', () => import('./render/TextDocumentNode'))
const Scene3DEditor = lazyWithChunkBoundary('3D 场景编辑器', () => import('./Scene3DEditor'))
const Model3DViewer = lazyWithChunkBoundary('3D 模型预览', () => import('./model3d/Model3DViewer'))

/** 节点状态徽标文案映射（skeleton，内容层细化在后续 STEP）。 */
const STATUS_TEXT: Record<string, string> = {
  idle: '',
  queued: '排队中',
  running: '生成中…',
  success: '',
  error: '失败',
  recoverable: '可重试',
}

/** 内容层额外依赖（S2 逐步接入的引擎无关回调/ref，随 kind 分发喂给 body）。 */
type NodeBodyDeps = {
  /** 全景：把全屏触发器回填给浮条「全屏」按钮。 */
  panoramaFullscreenTrigger: (trigger: (() => void) | null) => void
  /** 全景：上传换图 / 视口截图建节点。 */
  handlePanoramaFileChange: (event: React.ChangeEvent<HTMLInputElement>) => void
  /** 全景：视口截图建节点。 */
  handlePanoramaScreenshot: (screenshot: import('./PanoramaViewer').PanoramaScreenshot) => void
  /** 图片：裁剪/切图框当前档位（null=关闭）。 */
  cropGrid: CropGridSize | null
  /** 图片：裁剪框确认（复用 useNodeImageEditing.handleEditConfirm，纯 canvas 像素操作）。 */
  onCropConfirm: (result: CropGridResult) => void
  /** 图片：取消裁剪框。 */
  onCropCancel: () => void
  /** 图片：结果堆栈打开态（互斥浮条/内联标题）。 */
  imageStackOpen: boolean
  /** 图片：结果堆栈开合回调。 */
  onImageStackOpenChange: (open: boolean) => void
  /** 只读（分享预览等）：隐藏可交互浮条/编辑入口。 */
  readOnly: boolean
  /** 未生成/加载中占位文案（i18n，避免硬编码）。 */
  pendingText: string
}

/**
 * 节点内容层按 kind 分发（S2 STEP 2，复用老画布引擎无关的 body，按 code-explorer 判定表）：
 * - audio/text：AudioStripNode（可直接复用，seek 归一化坐标，无自研 DOM 契约）
 * - image：DeferredNodeImage 媒体预览 + NodeInlineImageTitle 内联标题（均无画布 DOM 耦合，可直接复用）
 * - video：NodeVideoPlaybackGuard（自愈播放）
 * - panorama：PanoramaViewer（纯 props 驱动，全屏 createPortal(document.body)，引擎无关可复用）
 * - 其余 kind：先占位，后续 STEP 逐个接入（可复用的搬 / 需小改的删 DOM 契约 / 必须重写的按官方机制）
 */
function renderNodeBody(
  node: NomiReactFlowNode['data']['nomiNode'],
  selected: boolean,
  deps: NodeBodyDeps,
  visualSize: { width: number; height: number },
): JSX.Element {
  if (node.kind === 'panorama') {
    const panoramaUrl = node.result?.url || node.meta?.imageUrl
    if (!panoramaUrl) {
      return <PanoramaUploadFallback onChange={deps.handlePanoramaFileChange} />
    }
    return (
      <div className="relative h-[140px] w-full overflow-hidden bg-workbench-bg/40">
        <React.Suspense fallback={<div className="h-full w-full bg-workbench-bg/40" />}>
          <PanoramaViewer
            imageUrl={panoramaUrl as string}
            width={visualSize.width}
            height={visualSize.height}
            onEnterFullscreen={deps.panoramaFullscreenTrigger}
            onScreenshot={deps.handlePanoramaScreenshot}
          />
        </React.Suspense>
      </div>
    )
  }
  // text：ProseMirror（tiptap）可编辑文本 body，引擎无关直接复用。
  if (node.kind === 'text') {
    return (
      <div className="h-full w-full">
        <React.Suspense fallback={<div className="h-full w-full bg-workbench-bg/40" />}>
          <TextDocumentNode node={node} />
        </React.Suspense>
      </div>
    )
  }
  // scene3d：Scene3DEditor 整卡（内部含 TrajectoryRenderer/SceneContent，R3F 引擎无关）。
  if (node.kind === 'scene3d') {
    return (
      <div className="h-full w-full">
        <React.Suspense fallback={<div className="h-full w-full bg-workbench-bg/40" />}>
          <Scene3DEditor node={node} width={visualSize.width} height={visualSize.height} readOnly={deps.readOnly} />
        </React.Suspense>
      </div>
    )
  }
  // 卡片 kind（character/scene/audio/whiteboard）：NodeCardBody 按 renderKind 分发 body，引擎无关。
  const renderKind = resolveNodeRenderKind(node)
  if (isCardRenderKind(renderKind)) {
    return <NodeCardBody renderKind={renderKind} node={node} readOnly={deps.readOnly} />
  }
  if (isAudioLikeGenerationNodeKind(node.kind)) {
    return <AudioStripNode node={node} />
  }
  if (isVideoLikeGenerationNodeKind(node.kind)) {
    const videoUrl = node.result?.url
    if (!videoUrl) {
      return (
        <div className="flex h-[120px] flex-col items-center justify-center gap-1 bg-workbench-bg/40 px-3 text-caption text-nomi-ink-60">
          <span>{deps.pendingText}</span>
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
    // model3d 结果（3D 模型预览）：R3F，独立 viewer。
    if (node.result?.type === 'model3d' && node.result.url) {
      return (
        <div className="relative h-[220px] w-full overflow-hidden bg-workbench-bg/40">
          <React.Suspense fallback={<div className="h-full w-full bg-workbench-bg/40" />}>
            <Model3DViewer url={node.result.url} />
          </React.Suspense>
        </div>
      )
    }
    const imageUrl = node.result?.url || node.result?.thumbnailUrl
    if (!imageUrl) {
      return (
        <div className="flex h-[120px] flex-col items-center justify-center gap-1 bg-workbench-bg/40 px-3 text-caption text-nomi-ink-60">
          <span>{deps.pendingText}</span>
        </div>
      )
    }
    // 图片容器高度用 resolveNodeVisualSize().height（内容驱动，随图片比例），object-contain 铺满
    // （补强 5：高度动态、由 react-flow 自测 DOM）。裁剪框 absolute inset-0 与图片显示区对齐。
    return (
      <div
        className="relative w-full overflow-hidden bg-workbench-bg/40"
        style={{ height: visualSize.height }}
      >
        <DeferredNodeImage
          src={imageUrl}
          alt={node.title || node.id}
          className="h-full w-full object-contain"
          placeholderClassName="bg-workbench-bg/40"
        />
        {/* 裁剪/切图框：editGrid 打开时 absolute inset-0 覆盖图片区（与显示图像素对齐）。 */}
        {deps.cropGrid !== null ? (
          <ImageCropGridOverlay
            imageUrl={imageUrl}
            gridSize={deps.cropGrid}
            onConfirm={(result) => deps.onCropConfirm(result)}
            onCancel={deps.onCropCancel}
          />
        ) : null}
        {/* 结果堆栈（多图切换）：计数/展开按钮 + 打开态网格面板。 */}
        <ImageResultStackControls
          node={node}
          readOnly={deps.readOnly}
          selected={selected}
          visualWidth={visualSize.width}
          visualHeight={visualSize.height}
          onOpenChange={deps.onImageStackOpenChange}
        />
        {!deps.imageStackOpen ? (
          <NodeInlineImageTitle nodeId={node.id} value={node.title || node.id} selected={selected} />
        ) : null}
      </div>
    )
  }
  return (
    <div className="flex h-[120px] flex-col items-center justify-center gap-1 bg-workbench-bg/40 px-3 text-caption text-nomi-ink-60">
      <span>{deps.pendingText}</span>
    </div>
  )
}

export function ReactFlowNode({ data, selected, dragging }: NodeProps<NomiReactFlowNode>): JSX.Element {
  const { t } = useTranslation()
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

  // —— 图片结果堆栈打开态（本地 UI 互斥开关，不进 store；打开时隐藏浮条/内联标题/composer）——
  const [imageStackOpen, setImageStackOpen] = React.useState(false)
  // 当节点取消选中或结果不足时自动收起（ImageResultStackControls 内也有自动关逻辑，这里兜底）。
  React.useEffect(() => {
    if (!selected) setImageStackOpen(false)
  }, [selected])

  // —— 全景：全屏 trigger 回填 + 上传换图/截图建节点 + 下载 ——
  const panoramaFullscreenRef = React.useRef<(() => void) | null>(null)
  const panorama = useNodePanoramaHandlers(node, visualSize)
  const panoramaDownload = useResultDownload(node)

  const isRemoveBackgroundPending =
    (node.status === 'queued' || node.status === 'running') && node.progress?.phase === 'remove-background'
  const isImageResult = node.kind !== 'panorama' && node.result?.type === 'image' && Boolean(node.result.url)
  const isPanorama = node.kind === 'panorama'

  return (
    <>
      {/* composer（react-flow 官方 NodeToolbar Bottom，S2 STEP 3）：
          NodeToolbar 不随 viewport 缩放（官方实现），默认节点选中显示、多选隐藏（自动处理）。
          composer 用 positionMode="inline"（NodeToolbar 提供恒定尺寸定位，官方建议）。 */}
      <NodeToolbar position={Position.Bottom} offset={12} isVisible={selected && !imageStackOpen}>
        <React.Suspense fallback={null}>
          <NodeGenerationComposer node={node} visualSize={visualSize} positionMode="inline" />
        </React.Suspense>
      </NodeToolbar>

      {/* 浮动工具条（react-flow 官方 NodeToolbar Top，S2 STEP 4）：生成后操作。
          NodeToolbar 提供恒定屏幕尺寸定位；浮条组件 positionMode="inline" 只复用纯按钮（ToolbarButton 等），
          不走老画布 FloatingToolbarShell 的反缩放定位（D1 定案废弃）。 */}
      {node.prompt || isImageResult || isPanorama || node.result?.url ? (
        <NodeToolbar position={Position.Top} offset={12} isVisible={selected && !imageStackOpen}>
          <React.Suspense fallback={null}>
            {/* 全景浮条：全屏 / 下载 / 生成记录 + 重传入口。 */}
            {isPanorama ? (
              <FloatingToolbarShell ariaLabel={t('generationCommon.node.panoramaActions')} positionMode="inline">
                <ToolbarButton
                  icon={<IconMaximize size={TBI.size} stroke={TBI.stroke} />}
                  label={t('generationCommon.node.panoramaPreview')}
                  title={t('generationCommon.node.panoramaPreview')}
                  disabled={!node.result?.url}
                  onClick={() => panoramaFullscreenRef.current?.()}
                />
                <ToolbarButton
                  icon={<IconDownload size={TBI.size} stroke={TBI.stroke} />}
                  label={t('generationCommon.resultDownload.download')}
                  title={t('generationCommon.resultDownload.downloadHint')}
                  disabled={panoramaDownload.downloading}
                  onClick={panoramaDownload.download}
                />
                <ToolbarProvenanceButton onOpen={() => setProvenanceOpen(true)} />
              </FloatingToolbarShell>
            ) : (
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
                      {t('generationCommon.node.regenerate')}
                    </button>
                  </>
                ) : null}
              </div>
            )}
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
          // 对齐老画布 BaseGenerationNode 视觉：节点根无 border/bg（透明壳），1px 内描边走 ring-inset + --nomi-line（深底画布下克制非"白边"），shadow-md 落在 shadow token。
          'relative overflow-hidden rounded-nomi bg-nomi-paper shadow-nomi-md ring-1 ring-inset ring-nomi-line',
          'text-body-sm text-nomi-ink',
          selected && 'ring-2 ring-nomi-accent',
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
      <div className="w-full">
        {renderNodeBody(node, selected, {
          panoramaFullscreenTrigger: (trigger) => {
            panoramaFullscreenRef.current = trigger
          },
          handlePanoramaFileChange: panorama.handlePanoramaFileChange,
          handlePanoramaScreenshot: panorama.handlePanoramaScreenshot,
          cropGrid: imageEditing.editGrid,
          onCropConfirm: (result) => void imageEditing.handleEditConfirm(result),
          onCropCancel: () => imageEditing.cancelEdit(),
          imageStackOpen,
          onImageStackOpenChange: setImageStackOpen,
          readOnly: false,
          pendingText: t('generationCommon.lightweightNode.idle'),
        }, visualSize)}
      </div>

      {/* 失败态：错误卡铺满节点正文（absolute inset-0），盖内容但不挡 resize/handles。 */}
      {status === 'error' && node.error ? (
        <NodeErrorReport
          message={node.error}
          meta={node.meta}
          onRetry={() => {
            void confirmAndRunNode(node.id)
          }}
        />
      ) : null}

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
