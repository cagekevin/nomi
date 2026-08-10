import { describe, expect, it } from 'vitest'
import { CANVAS_TOOLBAR_NODE_GROUPS, canvasToolbarNodeKinds } from './canvasToolbarModel'

describe('canvas toolbar node model', () => {
  it('keeps all eight creation tools directly available', () => {
    expect(canvasToolbarNodeKinds()).toEqual([
      'text',
      'image',
      'video',
      'audio',
      'model3d',
      'whiteboard',
      'panorama',
      'scene3d',
    ])
  })

  it('separates core media from spatial tools without an overflow group', () => {
    expect(CANVAS_TOOLBAR_NODE_GROUPS).toHaveLength(2)
    expect(CANVAS_TOOLBAR_NODE_GROUPS[0]).toEqual(['text', 'image', 'video', 'audio'])
    expect(CANVAS_TOOLBAR_NODE_GROUPS[1]).toEqual(['model3d', 'whiteboard', 'panorama', 'scene3d'])
    expect(canvasToolbarNodeKinds()).not.toContain('more')
  })
})
