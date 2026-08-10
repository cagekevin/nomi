// 结构性不变量：通用 UI（app-shell）不得反向依赖业务层（workbench）。
//
// Nomi 的分层底线是「底层对、顶层漏」：Electron/IPC 隔离是结构性的、写不出错；
// 而通用 UI 不依赖业务是约定式的、靠自觉，会被「顺手一写」破坏。本门岗用源码扫描
// 把这条约定升级成结构性保证——扫源码比渲染断言更直接、更难绕过（同 codexDirectionSeparation.test.ts 范式）。
//
// 覆盖两层：
//   1) src/ui/app-shell/** 不得 import 任何 workbench 路径（值或类型）。
//      一旦通用外壳感知业务，所有经过 app-shell 的业务都带上环依赖，重构业务层会牵动 UI 层。
//   2) app-shell 不得直接调用业务 store（useGenerationCanvasStore / useWorkbenchStore）。
//      业务回调必须由组合层注入，防「依赖只是转移到 props、通用 UI 反拿业务 store」的变相回退。
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const dir = path.dirname(fileURLToPath(import.meta.url))
const appShellDir = path.resolve(dir)

/** 递归收集 app-shell 下所有源码文件（.ts/.tsx），排除测试自身与被测测试文件。 */
function collectAppShellSources(): string[] {
  const files: string[] = []
  const walk = (current: string): void => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        walk(path.join(current, entry.name))
        continue
      }
      if (!entry.name.endsWith('.ts') && !entry.name.endsWith('.tsx')) continue
      files.push(path.join(current, entry.name))
    }
  }
  walk(appShellDir)
  return files
}

const sourceFiles = collectAppShellSources().filter(
  (file) => !file.endsWith('ui-business-decoupling.test.ts'),
)

// 相对路径的 import 才谈得上「依赖本仓业务层」；绝对/包名 import（react、@tabler 等）天然隔离。
const importFromWorkbench = /import\s+(?:type\s+)?[^'"]*from\s+['"][^'"]*workbench[^'"]*['"]/

describe('通用 UI（app-shell）与业务层解耦', () => {
  it('app-shell 不得 import 任何 workbench 路径（值或类型）', () => {
    expect(sourceFiles.length).toBeGreaterThan(0)
    const violations = sourceFiles.filter((file) => {
      const src = fs.readFileSync(file, 'utf8')
      return importFromWorkbench.test(src)
    })
    expect(violations).toEqual([])
  })

  it('app-shell 不得直接调用业务 store（业务回调须由组合层注入）', () => {
    const violations = sourceFiles.filter((file) => {
      const src = fs.readFileSync(file, 'utf8')
      // 覆盖两种写法：useGenerationCanvasStore(...) 与 useGenerationCanvasStore.getState()。
      // useXxxStore.getState 也是直接触碰业务状态，同样违反「由组合层注入」。
      return (
        /useGenerationCanvasStore\s*(?:\(|\.getState)/.test(src) ||
        /useWorkbenchStore\s*(?:\(|\.getState)/.test(src)
      )
    })
    expect(violations).toEqual([])
  })
})
