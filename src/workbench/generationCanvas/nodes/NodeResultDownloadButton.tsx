import React from 'react'
import { useTranslation } from 'react-i18next'
import { IconDownload } from '@tabler/icons-react'
import { useResultDownload } from './useResultDownload'
import { FloatingToolbarShell, TOOLBAR_ICON as I, ToolbarButton, ToolbarProvenanceButton } from './NodeFloatingToolbar'
import NodeVideoFrameToolbar from './NodeVideoFrameToolbar'
import type { GenerationCanvasNode } from '../model/generationCanvasTypes'

// 非图片结果（视频等）的浮条：视频结果 → 抽首帧/抽尾帧 + 下载（NodeVideoFrameToolbar）；
// 其它非图片结果 → 仅下载。图片结果的下载在 NodeImageEditToolbar。仅在选中且有可下载结果时渲染。

type Props = {
  node: GenerationCanvasNode
  selected: boolean
  onPreview: () => void
  /** 生成记录（从卡片右上角迁来；这条链覆盖视频与其它非图片结果）。 */
  onOpenProvenance: () => void
  /** react-flow 迁移（S2 STEP 4）：inline 时不渲染定位外壳，由 NodeToolbar 提供定位（复用纯按钮）。 */
  positionMode?: 'absolute-below' | 'inline'
}

export default function NodeResultDownloadButton({ node, selected, onPreview, onOpenProvenance, positionMode }: Props): JSX.Element | null {
  const { t } = useTranslation()
  const { canDownload, downloading, download } = useResultDownload(node)
  if (!selected || !canDownload || node.result?.type === 'image') return null

  // 视频结果 → 专用浮条（抽首/尾帧 + 下载）。
  if (node.result?.type === 'video') {
    return <NodeVideoFrameToolbar node={node} downloading={downloading} onDownload={download} onPreview={onPreview} onOpenProvenance={onOpenProvenance} positionMode={positionMode} />
  }

  return (
    <FloatingToolbarShell ariaLabel={t('generationCommon.resultDownload.actions')} positionMode={positionMode}>
      <ToolbarButton
        icon={<IconDownload size={I.size} stroke={I.stroke} />}
        label={t('generationCommon.resultDownload.download')}
        title={t('generationCommon.resultDownload.downloadHint')}
        disabled={downloading}
        onClick={download}
      />
      <ToolbarProvenanceButton onOpen={onOpenProvenance} />
    </FloatingToolbarShell>
  )
}
