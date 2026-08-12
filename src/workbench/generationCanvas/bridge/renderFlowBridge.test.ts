// 数据流桥单测（正式层，S1）：验证「store → react-flow 转换」与「react-flow 事件 → store 回写」双向成立。
// 不依赖 DOM，直接操作 store + 桥纯函数。
import { beforeEach, describe, expect, it } from 'vitest'
import { useGenerationCanvasStore } from '../store/generationCanvasStore'
import type { GenerationCanvasNode } from '../model/generationCanvasTypes'
import {
  applyConnectionToStore,
  applyDragSettledToStore,
  applyNodeChangesToStore,
  snapshotToReactFlow,
  toReactFlowEdge,
  toReactFlowNode,
} from './renderFlowBridge'

function node(id: string, x: number, y: number): GenerationCanvasNode {
  return { id, kind: 'image', title: id, position: { x, y }, categoryId: 'shots' }
}

beforeEach(() => {
  useGenerationCanvasStore.getState().restoreSnapshot({
    nodes: [node('a', 10, 20), node('b', 100, 200)],
    edges: [],
    selectedNodeIds: [],
    groups: [],
  })
})

describe('store → react-flow 转换', () => {
  it('GenerationCanvasNode → react-flow Node：position 映射 + 业务字段整包进 data', () => {
    const rfNode = toReactFlowNode(node('a', 10, 20))
    expect(rfNode.id).toBe('a')
    expect(rfNode.position).toEqual({ x: 10, y: 20 })
    // 业务字段不丢：整包塞 data.nomiNode（store 才是唯一真相，这里只是投影）。
    expect(rfNode.data.nomiNode.kind).toBe('image')
    expect(rfNode.data.nomiNode.title).toBe('a')
  })

  it('带 size 的节点：只塞 width（缩放后真实宽），不塞 height（高度内容驱动，react-flow 自测）', () => {
    const sized = { ...node('a', 10, 20), size: { width: 220, height: 500 } }
    const rfNode = toReactFlowNode(sized)
    expect(rfNode.width).toBe(220)
    // 关键契约（plan §三.5 补强 5）：height 不能塞死，让 react-flow 自测内容 DOM。
    expect(rfNode.height).toBeUndefined()
  })

  it('GenerationCanvasEdge → react-flow Edge：mode 语义整包进 data.nomiEdge（对齐节点 data.nomiNode）', () => {
    const rfEdge = toReactFlowEdge({
      id: 'e1',
      source: 'a',
      target: 'b',
      mode: 'reference',
      order: 1,
    })
    expect(rfEdge.source).toBe('a')
    expect(rfEdge.target).toBe('b')
    expect(rfEdge.data.nomiEdge.mode).toBe('reference')
    expect(rfEdge.data.nomiEdge.order).toBe(1)
  })

  it('snapshotToReactFlow 返回 store 当前全部 nodes/edges（单向桥渲染半程）', () => {
    const { nodes, edges } = snapshotToReactFlow()
    expect(nodes.map((n) => n.id).sort()).toEqual(['a', 'b'])
    expect(edges).toHaveLength(0)
  })
})

describe('react-flow 事件 → store 回写', () => {
  it('拖拽结束 applyDragSettledToStore → store.moveNode（松手一次回写绝对位置）', () => {
    applyDragSettledToStore('a', { x: 999, y: 888 })
    expect(useGenerationCanvasStore.getState().nodes.find((n) => n.id === 'a')?.position).toEqual({ x: 999, y: 888 })
  })

  it('拖拽中间帧 position change 不回写 store（避免更新风暴，松手才 commit）', () => {
    applyNodeChangesToStore([{ id: 'a', type: 'position', position: { x: 999, y: 888 }, dragging: true }])
    expect(useGenerationCanvasStore.getState().nodes.find((n) => n.id === 'a')?.position).toEqual({ x: 10, y: 20 })
  })

  it('remove change → store.deleteNode', () => {
    applyNodeChangesToStore([{ id: 'a', type: 'remove' }])
    expect(useGenerationCanvasStore.getState().nodes.map((n) => n.id)).toEqual(['b'])
  })

  it('onConnect → store.connectNodes（拖线落点建真边）', () => {
    applyConnectionToStore({ source: 'a', target: 'b' })
    const edges = useGenerationCanvasStore.getState().edges
    expect(edges).toHaveLength(1)
    expect(edges[0].source).toBe('a')
    expect(edges[0].target).toBe('b')
  })

  it('回写后 store 变更能再次经 snapshotToReactFlow 反映（双向闭环成立）', () => {
    // 拖拽结束回写
    applyDragSettledToStore('a', { x: 50, y: 60 })
    // 连线回写
    applyConnectionToStore({ source: 'a', target: 'b' })
    // 再快照 → react-flow 数据反映最新 store
    const snap = snapshotToReactFlow()
    expect(snap.nodes.find((n) => n.id === 'a')?.position).toEqual({ x: 50, y: 60 })
    expect(snap.edges).toHaveLength(1)
  })
})
