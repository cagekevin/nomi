import i18n from '../../../i18n'
import type { TaskResultDto } from '../../../workbench/api/taskApi'
// 默认 prompt 已抽到共享 config 资源（内容/代码分离）：本文件只引用、不内联大段字符串。
import {
  BROWSER_IMAGE_REPLICATE_PROMPT_EXTRACTION_PROMPT,
  BROWSER_IMAGE_STYLE_PROMPT_EXTRACTION_PROMPT,
} from '../../../config/prompts/browserPromptExtraction'

export type BrowserPromptExtraction = {
  title: string
  prompt: string
}

export type BrowserPromptExtractionMode = 'replicate' | 'style'

export const BROWSER_PROMPT_EXTRACTION_MODE_LABELS: Record<BrowserPromptExtractionMode, string> = {
  replicate: '画面复刻',
  style: '画面风格',
}

// 别名 re-export：既有引用方（settings/runner）继续从本文件拿常量，保持改动面最小。
export { BROWSER_IMAGE_REPLICATE_PROMPT_EXTRACTION_PROMPT, BROWSER_IMAGE_STYLE_PROMPT_EXTRACTION_PROMPT }

export const BROWSER_IMAGE_PROMPT_EXTRACTION_PROMPT = BROWSER_IMAGE_REPLICATE_PROMPT_EXTRACTION_PROMPT

export function browserPromptExtractionPromptForMode(mode: BrowserPromptExtractionMode): string {
  return mode === 'style'
    ? BROWSER_IMAGE_STYLE_PROMPT_EXTRACTION_PROMPT
    : BROWSER_IMAGE_REPLICATE_PROMPT_EXTRACTION_PROMPT
}

function asTrimmedString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function firstText(...values: unknown[]): string {
  for (const value of values) {
    const text = asTrimmedString(value)
    if (text) return text
  }
  return ''
}

function textFromContentParts(content: unknown): string {
  if (typeof content === 'string') return content.trim()
  if (!Array.isArray(content)) return ''
  return content
    .map((part) => {
      if (typeof part === 'string') return part
      if (!part || typeof part !== 'object') return ''
      const record = part as Record<string, unknown>
      return firstText(record.text, record.content, record.output_text)
    })
    .filter(Boolean)
    .join('')
    .trim()
}

export function extractTextFromTaskResult(result: TaskResultDto): string {
  if (!result || result.status !== 'succeeded') return ''
  const raw = result.raw
  if (!raw || typeof raw !== 'object') return ''
  const record = raw as Record<string, unknown>
  const direct = firstText(record.output_text, record.text)
  if (direct) return direct

  const choices = record.choices
  if (Array.isArray(choices) && choices.length > 0) {
    const first = choices[0] as Record<string, unknown> | undefined
    const message = first?.message as Record<string, unknown> | undefined
    const messageText = textFromContentParts(message?.content)
    if (messageText) return messageText
    const legacyText = firstText(first?.text)
    if (legacyText) return legacyText
  }

  const output = record.output
  if (Array.isArray(output)) {
    const outputText = output
      .map((item) => {
        if (!item || typeof item !== 'object') return ''
        const itemRecord = item as Record<string, unknown>
        return textFromContentParts(itemRecord.content)
      })
      .filter(Boolean)
      .join('\n')
      .trim()
    if (outputText) return outputText
  }

  return textFromContentParts(record.content)
}

function parseJsonObject(text: string): Record<string, unknown> | null {
  const normalized = text.trim()
  if (!normalized) return null
  const jsonText = normalized.startsWith('{')
    ? normalized
    : normalized.slice(normalized.indexOf('{'), normalized.lastIndexOf('}') + 1)
  if (!jsonText.startsWith('{') || !jsonText.endsWith('}')) return null
  try {
    const parsed = JSON.parse(jsonText)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : null
  } catch {
    return null
  }
}

function promptFromNestedAnalysis(record: Record<string, unknown>): string {
  const localizedPrompts = record.localizedPrompts as Record<string, unknown> | undefined
  const zhPrompts = localizedPrompts?.['zh-CN'] as Record<string, unknown> | undefined
  const prompts = record.prompts as Record<string, unknown> | undefined
  const platformPrompts = record.platformPrompts as Record<string, unknown> | undefined
  return firstText(
    record.prompt,
    zhPrompts?.faithful,
    zhPrompts?.commercial,
    prompts?.faithful,
    prompts?.commercial,
    platformPrompts?.openai,
  )
}

function stylePromptFromAnalysis(record: Record<string, unknown>): string {
  const formatted = JSON.stringify(record, null, 2)
  return formatted || firstText(record.stylePrompt, record.prompt)
}

export function parseBrowserPromptExtraction(
  text: string,
  mode: BrowserPromptExtractionMode = 'replicate',
): BrowserPromptExtraction {
  const parsed = parseJsonObject(text)
  if (parsed) {
    const prompt = mode === 'style' ? stylePromptFromAnalysis(parsed) : promptFromNestedAnalysis(parsed)
    if (prompt) {
      return {
        title:
          firstText(parsed.title, (parsed.localizedTitles as Record<string, unknown> | undefined)?.['zh-CN']) ||
          (mode === 'style' ? i18n.t('browserAssets.extraction.style') : i18n.t('browserAssets.extraction.imagePrompt')),
        prompt,
      }
    }
  }
  const fallback = text.trim()
  return {
    title: mode === 'style' ? i18n.t('browserAssets.extraction.style') : i18n.t('browserAssets.extraction.imagePrompt'),
    prompt: fallback,
  }
}
