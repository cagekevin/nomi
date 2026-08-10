// 任务入口是跨创作/生成/预览的常驻入口：即使重启后队列为空，用户仍要能打开任务面板和通知设置。
// 本仓没有 @testing-library/react，且这里防的是结构性回退（把旧的 return null / :has 隐藏带回来），
// 因此沿用既有源码契约测试的做法，直接守住两个会让入口消失的结构。
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const dir = path.dirname(fileURLToPath(import.meta.url))
const read = (file: string): string => fs.readFileSync(path.join(dir, file), 'utf8')

describe('任务面板入口常驻契约', () => {
  it('空队列时仍渲染任务按钮和所属分组', () => {
    const buttonSource = read('TaskCenterButton.tsx')
    expect(buttonSource).toMatch(/export function TaskCenterButton[\s\S]*?: JSX\.Element\s*\{/)
    expect(buttonSource).not.toMatch(/return null/)

    // NomiAppBar 已与业务解耦：任务按钮由组合层（WorkbenchShell）无条件注入到 taskCenterButton 插槽，
    // 不再住在 app-shell 内部。这里守住「插槽存在」和「组合层注入不被 :has 隐藏」两条结构。
    const appBarSource = read('../../ui/app-shell/NomiAppBar.tsx')
    const taskGroupStart = appBarSource.indexOf('nomi-appbar__group--tasks')
    const slotStart = appBarSource.indexOf('{taskCenterButton}', taskGroupStart)
    expect(taskGroupStart).toBeGreaterThan(-1)
    expect(slotStart).toBeGreaterThan(taskGroupStart)
    expect(appBarSource.slice(taskGroupStart, slotStart)).not.toContain('not(:has(button))')

    const shellSource = read('../WorkbenchShell.tsx')
    expect(shellSource).toMatch(/taskCenterButton=\{/)
    expect(shellSource).toMatch(/<TaskCenterButton/)
  })
})
