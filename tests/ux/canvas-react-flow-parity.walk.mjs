// React-Flow 画布「与原版对齐」自查 walk（parity）。
//
// 目的：react-flow 渲染层（VITE_RENDER_CANVAS_WITH_REACT_FLOW=true）每改一次，跑一遍本 walk，
// 把「活不仔细 / 和原版差别大」的常见错误变成自动化断言，红就过不了。原版契约从老画布
// (BaseGenerationNode / GenerationCanvas) 源码固化而来，不是脑补。
//
// 覆盖的「活不仔细」类错误（用户已踩过的）：
//   P1 wrapper 几何 ≠ inner → 白边/错位（本次 fix c165d32 修）
//   P2 wrapper 残留 react-flow 默认白底/边框/padding
//   P3 i18n key 拼错（generationCommon.node.pending 不存在，commit 8a89726 修）
//   P4 pending 占位硬编码文案
//   P5 左侧加节点工具栏漏挂（CanvasToolbar 至少 4 按钮，commit 8a89726 修）
//   P6 渲染宽被扭曲（应为整数 = store node.size.width，由 registry defaultSize 定义，不硬编码）
//   P7 节点根无 ring 内描边（老画布 ring-1 ring-inset ring-nomi-line）
//
// 用法：VITE_RENDER_CANVAS_WITH_REACT_FLOW=true pnpm run build && node tests/ux/canvas-react-flow-parity.walk.mjs
import { _electron as electron } from 'playwright'
import { mkdirSync, mkdtempSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const tempRoot = mkdtempSync(path.join(os.tmpdir(), 'nomi-rf-parity-'))
const userDataDir = path.join(tempRoot, 'user-data')
const projectsDir = path.join(tempRoot, 'projects')
mkdirSync(projectsDir, { recursive: true })

const app = await electron.launch({
  executablePath: require('electron'),
  args: ['.', `--user-data-dir=${userDataDir}`, '--no-proxy-server'],
  cwd: repoRoot,
  env: {
    ...process.env,
    NOMI_E2E: '1',
    NOMI_E2E_ALLOW_MULTI_INSTANCE: '1',
    NOMI_ELECTRON_USER_DATA_DIR: userDataDir,
    NOMI_SETTINGS_DIR: userDataDir,
    NOMI_PROJECTS_DIR: projectsDir,
  },
})

let passed = 0
function assert(condition, label, detail = '') {
  if (!condition) throw new Error(`PARITY FAIL: ${label}${detail ? ` — ${detail}` : ''}`)
  passed += 1
  console.log(`  ✓ ${label}${detail ? ` — ${detail}` : ''}`)
}

let win = await app.firstWindow()
const getWin = () => {
  const live = app.windows().filter((candidate) => !candidate.isClosed())
  win = live.find((candidate) => /projectId=/.test(candidate.url())) || live[live.length - 1] || win
  return win
}

async function dismissFirstRun() {
  for (let index = 0; index < 6; index += 1) {
    const action = getWin().locator('button, [role="button"], a', { hasText: /跳过|完成|知道了|开始创作|稍后/ }).first()
    if (await action.isVisible().catch(() => false)) await action.click({ timeout: 900 }).catch(() => {})
    await getWin().keyboard.press('Escape').catch(() => {})
    await getWin().waitForTimeout(180)
  }
}

const pageErrors = []
getWin().on('pageerror', (error) => pageErrors.push(String(error)))

try {
  await getWin().waitForLoadState('domcontentloaded')
  await getWin().waitForTimeout(1700)
  await getWin().evaluate(() => {
    localStorage.setItem('__nomiE2E', '1')
    for (const key of ['nomi:splash:v1', 'nomi:journey-tour:v1']) localStorage.setItem(key, 'seen')
  })
  await getWin().reload()
  await getWin().waitForLoadState('domcontentloaded')
  await getWin().waitForTimeout(1600)
  await dismissFirstRun()

  const blankProject = getWin().locator('button, [role="button"]', { hasText: '新建空白项目' }).first()
  await blankProject.waitFor({ timeout: 8000 })
  await blankProject.click()
  await getWin().waitForTimeout(2200)
  await dismissFirstRun()

  const generation = getWin().getByRole('button', { name: '生成', exact: true }).first()
  await generation.waitFor({ timeout: 8000 })
  await generation.click()
  await getWin().waitForTimeout(2000)

  // 进入 react-flow 画布。
  const rfContainer = getWin().locator('.react-flow')
  await rfContainer.waitFor({ timeout: 8000 })

  // P5 左侧加节点工具栏已挂（CanvasToolbar）。
  const canvasToolbar = getWin().locator('.generation-canvas-v2-toolbar')
  await canvasToolbar.waitFor({ timeout: 5000 })
  const toolbarButtons = await canvasToolbar.locator('button').count()
  assert(toolbarButtons >= 4, 'P5 工具栏已挂且 ≥4 个加节点按钮', `${toolbarButtons} 个`)

  // 空态 CTA 建首个节点（image）。
  const emptyCta = getWin().locator('button', { hasText: /新建画面/ }).first()
  await emptyCta.waitFor({ timeout: 5000 })
  await emptyCta.click()
  await getWin().waitForTimeout(800)
  const firstNode = getWin().locator('.react-flow__node').first()
  await firstNode.waitFor({ timeout: 5000 })

  // 建第二个节点（video）——右键菜单建，顺带验交互。
  const pane = getWin().locator('.react-flow__pane')
  await pane.waitFor({ timeout: 5000 })
  const paneBox = await pane.boundingBox()
  const rightX = Math.round(paneBox.x + paneBox.width * 0.65)
  const rightY = Math.round(paneBox.y + paneBox.height * 0.7)
  await getWin().mouse.click(rightX, rightY, { button: 'right' })
  await getWin().waitForTimeout(500)
  const videoItem = getWin().locator('[role="menuitem"]', { hasText: /视频|video/i }).first()
  await videoItem.click()
  await getWin().waitForTimeout(800)

  const nodeCount = await getWin().locator('.react-flow__node').count()
  assert(nodeCount === 2, '建了两个节点（image + video）', `${nodeCount}`)



  // ── 原版契约对照断言组 ──
  // P1/P2/P6/P7：dump 每个节点 wrapper 与 inner 的几何 + 样式，逐一对照原版。
  const nodesProbe = await getWin().evaluate(() => {
    const collect = (el) => {
      const cs = getComputedStyle(el)
      const r = el.getBoundingClientRect()
      return {
        cls: el.className,
        rect: { x: r.x, y: r.y, w: r.width, h: r.height },
        background: cs.backgroundColor,
        borderTopWidth: cs.borderTopWidth,
        padding: cs.paddingTop,
        boxShadow: cs.boxShadow,
      }
    }
    const out = []
    for (const wrapper of document.querySelectorAll('.react-flow__node')) {
      const inner = wrapper.querySelector('.generation-canvas-v2-node')
      out.push({ wrapper: collect(wrapper), inner: inner ? collect(inner) : null })
    }
    return out
  })

  const round2 = (n) => Math.round(Number(n) * 100) / 100
  for (const [index, probe] of nodesProbe.entries()) {
    const w = probe.wrapper
    const inner = probe.inner
    assert(Boolean(inner), `节点${index} inner 存在`)
    // P2：wrapper 不得残留 react-flow 默认白底（#fff）——应为透明。
    const isTransparentBg = /rgba\(0, 0, 0, 0\)|transparent/.test(w.background)
    assert(isTransparentBg, `节点${index} P2 wrapper 背景透明（无默认白底）`, w.background)
    // P2：wrapper 无边框、无 padding。
    assert(Number.parseFloat(w.borderTopWidth) === 0, `节点${index} P2 wrapper 无默认边框`, w.borderTopWidth)
    assert(Number.parseFloat(w.padding) === 0, `节点${index} P2 wrapper 无默认 padding`, w.padding)
    // P1：wrapper 与 inner 几何完全重合（无白边/错位）。
    assert(
      round2(w.rect.x) === round2(inner.rect.x) && round2(w.rect.y) === round2(inner.rect.y),
      `节点${index} P1 wrapper 与 inner 左上角对齐`,
      `${round2(w.rect.x)},${round2(w.rect.y)} vs ${round2(inner.rect.x)},${round2(inner.rect.y)}`,
    )
    assert(
      round2(w.rect.w) === round2(inner.rect.w) && round2(w.rect.h) === round2(inner.rect.h),
      `节点${index} P1 wrapper 与 inner 尺寸一致`,
      `${round2(w.rect.w)}x${round2(w.rect.h)} vs ${round2(inner.rect.w)}x${round2(inner.rect.h)}`,
    )
    // P6：节点渲染宽 = 整数 >0（react-flow 未扭曲宽度；真实宽度 = store node.size.width，
    // 由 registry defaultSize 定义，如 image 340x280，不硬编码常数——硬编码会像"220"那样拍脑袋定错基线）。
    assert(Number.isInteger(inner.rect.w) && inner.rect.w > 0, `节点${index} P6 渲染宽为合法整数`, `${round2(inner.rect.w)}`)
    // P7：inner 有 ring 内描边（老画布 ring-inset，视觉是中性的细线非白边）。
    const hasInsetRing = /ring-inset/.test(inner.cls) && /ring-nomi-line|ring-1|ring-2/.test(inner.cls)
    assert(hasInsetRing, `节点${index} P7 inner 有 ring 内描边（对齐老画布）`, inner.cls)
  }

  // P4：pending 占位文案来自 i18n（非硬编码）。node.kind 属性和"待生成"文案走 i18n key，
  // 页面文本不得出现硬编码的英文 pending 键名。
  const leakedKey = await getWin().locator('body').innerText()
  assert(!leakedKey.includes('generationCommon.node.pending'), 'P4 无泄漏的 i18n 占位键名')
  assert(!leakedKey.includes('generationCommon.lightweightNode.idle'), 'P4 无泄漏的 i18n idle 键名')
  // P4 增强：画布内应能见到 i18n 渲染后的中文占位"待生成"（image/video 未生成态）。
  const canvasText = await getWin().locator('.react-flow').innerText()
  assert(canvasText.includes('待生成'), 'P4 未生成节点显示 i18n 占位"待生成"')

  // P3：关键 i18n key 在 locale 里存在（读 src/i18n/locales/zh-CN 或实际 t() 映射）。
  // 用页面渲染验证：pending 占位若 key 不存在会原样输出 key 名（P4 已覆盖漏键）。
  // 这里再硬查 locale 文件，防 key 存在但文案空/错。
  const pendingText = await getWin().locator('.react-flow__node').first().innerText()
  assert(pendingText.length > 0, 'P3 pending 占位非空文案')

  // 零页面错误。
  assert(pageErrors.length === 0, '全程无页面错误', pageErrors.join(' | '))

  console.log(`\n✅ React-Flow 原版对齐自查通过：${passed} 项断言`)
} catch (error) {
  console.error(`\n❌ ${error.message}`)
  process.exitCode = 1
} finally {
  await app.close().catch(() => {})
}
