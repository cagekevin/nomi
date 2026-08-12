// React-Flow 画布 smoke walk（S4）：验证 react-flow 渲染层真机可用。
//
// 背景：react-flow 画布（VITE_RENDER_CANVAS_WITH_REACT_FLOW=true）是迁移目标渲染层。
// 现有画布 walk（canvas-drag-pan-gestures 等）断言绑老画布 DOM（.generation-canvas-v2__canvas
// transform / 磁性 handle / __edge-tag-pill），react-flow 下必然失败——本 walk 用 react-flow
// 选择器（.react-flow__node / .react-flow__edge / .react-flow__pane）重新断言 S3/S4 增量：
//   ① 进入 react-flow 画布（.react-flow 容器出现）
//   ② 右键菜单（D1）：空白右键 → NodeAddMenu 弹出 → 建 image 节点
//   ③ 节点渲染（S2）：.react-flow__node[data-node-id] 出现
//   ④ 再建一个节点 → 两个节点
//   ⑤ 右键菜单建节点闭环：点菜单项 → 节点创建 + 菜单关闭
//   ⑥ 全程无页面错误
//
// 真 Electron + 真构建产物（需 VITE_RENDER_CANVAS_WITH_REACT_FLOW=true 构建），隔离 userData/projects，
// 零额度（不触发生成）。
// 用法：VITE_RENDER_CANVAS_WITH_REACT_FLOW=true pnpm run build && node tests/ux/canvas-react-flow-smoke.walk.mjs
import { _electron as electron } from 'playwright'
import { mkdirSync, mkdtempSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const shotsDir = path.join(repoRoot, 'tests/ux/shots/canvas-react-flow-smoke')
const tempRoot = mkdtempSync(path.join(os.tmpdir(), 'nomi-rf-smoke-'))
const userDataDir = path.join(tempRoot, 'user-data')
const projectsDir = path.join(tempRoot, 'projects')
mkdirSync(projectsDir, { recursive: true })
mkdirSync(shotsDir, { recursive: true })

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
  if (!condition) throw new Error(`WALK FAIL: ${label}${detail ? ` — ${detail}` : ''}`)
  passed += 1
  console.log(`  ✓ ${label}${detail ? ` — ${detail}` : ''}`)
}

let win = await app.firstWindow()
const getWin = () => {
  const live = app.windows().filter((candidate) => !candidate.isClosed())
  win = live.find((candidate) => /projectId=/.test(candidate.url())) || live[live.length - 1] || win
  return win
}

async function snap(name) {
  const file = path.join(shotsDir, name)
  await getWin().screenshot({ path: file })
  console.log(`  · 截图 ${name}`)
  return file
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

  // ① 进入 react-flow 画布：.react-flow 容器出现（而非老画布 .generation-canvas-v2__stage）。
  const rfContainer = getWin().locator('.react-flow')
  await rfContainer.waitFor({ timeout: 8000 })
  assert(true, '进入 react-flow 画布（.react-flow 容器出现）')
  await snap('01-enter-react-flow-canvas.png')

  // 老画布 stage 不应出现（确认渲染的是 react-flow 而非老画布）。
  const legacyStage = await getWin().locator('.generation-canvas-v2__stage').count()
  assert(legacyStage === 0, '没有老画布 stage（渲染的是 react-flow）')

  // ② 空态 CTA 阶段：空分类显示 CanvasEmptyState（S1 C2），点"新建画面"建首个节点。
  const emptyCta = getWin().locator('button', { hasText: /新建画面/ }).first()
  await emptyCta.waitFor({ timeout: 5000 })
  assert(true, '空分类显示引导 CTA（CanvasEmptyState）')
  await emptyCta.click()
  await getWin().waitForTimeout(800)
  const firstNode = getWin().locator('.react-flow__node').first()
  await firstNode.waitFor({ timeout: 5000 })
  assert(true, '点空态 CTA 建了第一个节点（.react-flow__node 出现）')
  await snap('02-empty-cta-built.png')

  // ③ 右键菜单（D1）：节点存在 + 空态消失后，pane 上右键应能弹 NodeAddMenu。
  const pane = getWin().locator('.react-flow__pane')
  await pane.waitFor({ timeout: 5000 })
  const paneBox = await pane.boundingBox()
  assert(Boolean(paneBox), '找到 react-flow pane 空白区')
  // 在画布右下空白区右键（避开已有节点）。
  const rightX = Math.round(paneBox.x + paneBox.width * 0.65)
  const rightY = Math.round(paneBox.y + paneBox.height * 0.7)
  await getWin().mouse.click(rightX, rightY, { button: 'right' })
  await getWin().waitForTimeout(500)
  const menu = getWin().locator('[role="menu"]').last()
  await menu.waitFor({ timeout: 4000 })
  assert(true, '空白右键弹出节点添加菜单（D1）')
  await snap('03-right-click-menu.png')

  // ④ 点菜单项建 video 节点 → 节点数变 2。
  const beforeCount = await getWin().locator('.react-flow__node').count()
  const videoItem = getWin().locator('[role="menuitem"]', { hasText: /视频|video/i }).first()
  await videoItem.click()
  await getWin().waitForTimeout(800)
  const afterCount = await getWin().locator('.react-flow__node').count()
  assert(afterCount === beforeCount + 1, '右键菜单建节点成功', `${beforeCount} → ${afterCount}`)
  // 菜单应已关闭（点击菜单项后 setContextMenu(null)）。
  const menuCountAfter = await getWin().locator('[role="menu"]').count()
  assert(menuCountAfter === 0, '点击菜单项后菜单关闭')
  await snap('04-two-nodes.png')

  // ⑤ 边标签门基线：当前无连线，无 react-flow__edge。
  const labelsBefore = await getWin().locator('.react-flow__edge').count()
  assert(labelsBefore === 0, '当前无连线（无 react-flow__edge）', `${labelsBefore}`)

  // ⑥ 选中节点：点第一个 react-flow__node 中心，断言选中态生效（A4 选区同步修复后）。
  // 根因修复：桥 applyNodeChangesToStore 处理 select change 回写 store.selectedNodeIds，
  // toReactFlowNode 从 store.selectedNodeIds 投影 selected（wrapper 应出现 .selected / inner 出现 border-nomi-accent）。
  const targetNode = getWin().locator('.react-flow__node').first()
  const targetBox = await targetNode.boundingBox()
  if (targetBox) {
    await getWin().mouse.click(targetBox.x + targetBox.width / 2, targetBox.y + targetBox.height / 2)
    await getWin().waitForTimeout(500)
  }
  const selectionProbe = await getWin().evaluate(() => {
    const wrapper = document.querySelector('.react-flow__node')
    const inner = wrapper?.querySelector('.generation-canvas-v2-node')
    return {
      wrapperClass: wrapper?.className || null,
      innerClass: inner?.className || null,
    }
  })
  console.log(`  · 选中态：wrapper=${selectionProbe.wrapperClass} | inner=${selectionProbe.innerClass}`)
  const isSelected =
    (selectionProbe.wrapperClass?.includes('selected') ?? false) ||
    (selectionProbe.innerClass?.includes('border-nomi-accent') ?? false)
  assert(isSelected, '点节点后选中态生效（A4 选区同步）', JSON.stringify(selectionProbe))
  await snap('05-node-selected.png')

  // ⑦ 全程无页面错误。
  assert(pageErrors.length === 0, '全程无页面错误', pageErrors.join(' | '))

  console.log(`\n✅ React-Flow 画布 smoke 走查通过：${passed} 项断言，截图在 ${shotsDir}`)
} catch (error) {
  await snap('99-failure.png').catch(() => {})
  console.error(`\n❌ ${error.message}`)
  process.exitCode = 1
} finally {
  await app.close().catch(() => {})
}
