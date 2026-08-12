// ReactFlowNode — react-flow 自定义节点（S2 STEP 1，从零按官方方式建，不背老画布壳包袱）。
//
// 目标（用户拍板）：安全过渡到 react-flow，功能逐个按官方机制迁移。老画布（BaseGenerationNode）
// 是过渡产品，S7 删。本节点从零消费 NodeProps + store，不依赖 BaseGenerationNode 的 952 行自研壳。
//
// S2 阶段能力（按功能迁移映射表 STEP 1）：
// - 渲染节点基础信息 + 状态（title/kind/status/progress）
// - NodeResizer 缩放（react-flow 官方）
// - 预留 Handle 骨架（连线在 S4 接）
// - 内容层（media/composer/参数条）后续按官方机制（NodeToolbar 等）逐步扩展
import React from 'react'
import { Handle, NodeResizer, Position, type NodeProps } from '@xyflow/react'
import { cn } from '../../../utils/cn'
import type { NomiReactFlowNode } from '../bridge/renderFlowBridge'

/** 节点状态徽标文案映射（skeleton，内容层细化在后续 STEP）。 */
const STATUS_TEXT: Record<string, string> = {
  idle: '',
  queued: '排队中',
  running: '生成中…',
  success: '',
  error: '失败',
  recoverable: '可重试',
}

export function ReactFlowNode({ data, selected, dragging }: NodeProps<NomiReactFlowNode>): JSX.Element {
  const node = data.nomiNode
  const status = node.status ?? 'idle'

  return (
    <div
      className={cn(
        'generation-canvas-v2-node',
        'relative rounded-nomi border bg-nomi-paper shadow-nomi-md',
        'w-[220px] text-body-sm text-nomi-ink',
        selected && 'border-nomi-accent ring-2 ring-nomi-accent/30',
        dragging && 'opacity-70',
      )}
      data-node-id={node.id}
      style={{ width: node.size?.width ?? 220 }}
    >
      {/* 8 向缩放（react-flow 官方，替代自研 resize 热区；S2 STEP 2 接 Aspect 锁比） */}
      <NodeResizer
        isVisible={selected}
        minWidth={120}
        minHeight={80}
        lineClassName="border-nomi-accent"
        handleClassName="bg-nomi-accent"
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

      {/* 节点主体（内容层：media/composer/参数条，后续 STEP 按官方机制扩展） */}
      <div className="flex h-[120px] flex-col items-center justify-center gap-1 bg-workbench-bg/40 px-3 text-caption text-nomi-ink-60">
        <span>内容层（S2 后续 STEP 接入）</span>
        <span className="opacity-60">{node.prompt ? '· 有 prompt ·' : '· 空节点 ·'}</span>
      </div>

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
  )
}

export default ReactFlowNode
