// POC 数据流桥单测：验证「store → react-flow 转换」与「react-flow 事件 → store 回写」双向成立。
// 不依赖 DOM，直接操作 store + 桥纯函数。对应 baseline §六验收。
import { beforeEach, describe, expect, it } from 'vitest'
import { useGenerationCanvasStore } from '../../workbench/generationCanvas/store/generationCanvasStore'
import type { GenerationCanvasNode } from '../../workbench/generationCanvas/model/generationCanvasTypes'
import {
  applyConnectionToStore,
  applyNodeChangesToStore,
  snapshotToReactFlow,
  toReactFlowEdge,
  toReactFlowNode,
} from './bridge'

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

  it('GenerationCanvasEdge → react-flow Edge：mode 语义旁路保留', () => {
    const rfEdge = toReactFlowEdge({
      id: 'e1',
      source: 'a',
      target: 'b',
      mode: 'reference',
      order: 1,
    })
    expect(rfEdge.source).toBe('a')
    expect(rfEdge.target).toBe('b')
    expect(rfEdge.nomiEdge?.mode).toBe('reference')
  })

  it('snapshotToReactFlow 返回 store 当前全部 nodes/edges（单向桥渲染半程）', () => {
    const { nodes, edges } = snapshotToReactFlow()
    expect(nodes.map((n) => n.id).sort()).toEqual(['a', 'b'])
    expect(edges).toHaveLength(0)
  })
})

describe('react-flow 事件 → store 回写', () => {
  it('position change → store.moveNode（拖拽回写绝对位置）', () => {
    applyNodeChangesToStore([{ id: 'a', type: 'position', position: { x: 999, y: 888 }, dragging: false }])
    expect(useGenerationCanvasStore.getState().nodes.find((n) => n.id === 'a')?.position).toEqual({ x: 999, y: 888 })
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
    // 拖拽回写
    applyNodeChangesToStore([{ id: 'a', type: 'position', position: { x: 50, y: 60 }, dragging: false }])
    // 连线回写
    applyConnectionToStore({ source: 'a', target: 'b' })
    // 再快照 → react-flow 数据反映最新 store
    const snap = snapshotToReactFlow()
    expect(snap.nodes.find((n) => n.id === 'a')?.position).toEqual({ x: 50, y: 60 })
    expect(snap.edges).toHaveLength(1)
  })
})
