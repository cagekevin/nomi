// React 19 兼容：恢复全局 `JSX` 命名空间。
//
// React 19 移除了全局 `JSX` 命名空间（`JSX.Element` 等不再全局可用，须 `import type { JSX } from 'react'`）。
// 本项目大量组件用裸 `JSX.Element` 作返回类型（453+ 处），逐文件改不现实。按 React 19 官方迁移
// 兼容方案，此处把全局 `JSX` 指向 `react` 导出的 `JSX`，一次声明全局恢复。
// 注意：模块需显式 export 才能作为全局声明生效（见文件末尾 `export {}`）。

import type { JSX as ReactJSX } from 'react'

declare global {
  namespace JSX {
    type Element = ReactJSX.Element
    type ElementClass = ReactJSX.ElementClass
    type ElementAttributesProperty = ReactJSX.ElementAttributesProperty
    type ElementChildrenAttribute = ReactJSX.ElementChildrenAttribute
    type LibraryManagedAttributes = ReactJSX.LibraryManagedAttributes
    type IntrinsicAttributes = ReactJSX.IntrinsicAttributes
    type IntrinsicClassAttributes = ReactJSX.IntrinsicClassAttributes
    type IntrinsicElements = ReactJSX.IntrinsicElements
  }
}

export {}
