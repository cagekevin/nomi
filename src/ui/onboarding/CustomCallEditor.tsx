/**
 * 自定义调用编辑器（样张 docs/design/mockups/2026-08-04-custom-call-editor.html §2）。
 * 一屏三步：贴材料 → AI 生成脚本（复用创作助手同文本脑，prompt_refine 通道）→ 试跑（真调、
 * 花一次最小额度、把实际请求/响应摊开——参考图闸对脚本失明的补偿）。保存即接管该模型调用；
 * 留空/删除=恢复默认。弹窗走 DesignModal（同 OnboardingWizard），content 挂 workbench-shell
 * 接回 --workbench-* token 域（Portal 脱域陷阱，见 OnboardingFloatingPanel 头注释）。
 */
import React from 'react'
import { useTranslation } from 'react-i18next'
import { IconAlertTriangle, IconCheck, IconPlayerPlay, IconSparkles } from '@tabler/icons-react'
import { cn } from '../../utils/cn'
import { DesignModal, confirmDialog } from '../../design'
import { getDesktopBridge } from '../../desktop/bridge'
import { getTextBrain } from '../../workbench/api/promptLibraryApi'
import { runWorkbenchTextTaskStream } from '../../workbench/api/taskApi'
import { testRunCustomCall, upsertCustomCallModel } from '../../workbench/api/modelCatalogApi'
import { stripCodeFences } from './customCallIntent'

export type CustomCallTarget = {
  vendorKey: string
  modelKey: string
  label: string
  /** 已存的脚本（无则空串）。 */
  script: string
}

type TestRunState =
  | { phase: 'idle' }
  | { phase: 'running' }
  | {
      phase: 'done'
      ok: boolean
      assets: string[]
      errorMessage?: string
      transcript: Array<{
        method: string
        url: string
        status: 'ok' | 'error'
        durationMs: number
        requestPreview?: string
        responsePreview?: string
        errorMessage?: string
      }>
      durationMs: number
    }

const inputCls =
  'w-full rounded-nomi-sm border border-nomi-line bg-nomi-paper px-2.5 py-2 text-body-sm text-nomi-ink placeholder:text-nomi-ink-40 outline-none focus:border-nomi-accent'

export function CustomCallEditor({
  target,
  onClose,
  onSaved,
}: {
  target: CustomCallTarget | null
  onClose: () => void
  onSaved: () => void
}): JSX.Element {
  const { t } = useTranslation()
  const [material, setMaterial] = React.useState('')
  const [script, setScript] = React.useState('')
  const [aiRunning, setAiRunning] = React.useState(false)
  const [aiError, setAiError] = React.useState('')
  const [test, setTest] = React.useState<TestRunState>({ phase: 'idle' })
  const [saveError, setSaveError] = React.useState('')
  const abortRef = React.useRef<AbortController | null>(null)

  // 打开时装载既有脚本；关闭清态。
  React.useEffect(() => {
    if (target) {
      setScript(target.script)
      setMaterial('')
      setAiError('')
      setSaveError('')
      setTest({ phase: 'idle' })
    }
    return () => abortRef.current?.abort()
  }, [target])

  const bridge = getDesktopBridge()
  const contract = React.useMemo(() => {
    try {
      return bridge?.modelCatalog.customCallContract?.() ?? null
    } catch {
      return null
    }
  }, [bridge])

  const runAi = React.useCallback(
    async (repair?: { lastError: string }) => {
      if (!target || !bridge) return
      if (aiRunning) {
        abortRef.current?.abort()
        return
      }
      setAiError('')
      setAiRunning(true)
      const ctrl = new AbortController()
      abortRef.current = ctrl
      try {
        const brain = await getTextBrain()
        if (!brain) {
          setAiError(t('onboardingProviders.customCall.aiNeedTextModel'))
          return
        }
        const instruction = bridge.modelCatalog.customCallAiInstruction?.({
          vendorKey: target.vendorKey,
          modelKey: target.modelKey,
          material: material.trim(),
          ...(repair ? { currentScript: script, lastError: repair.lastError } : {}),
        })
        if (!instruction) return
        let acc = ''
        await runWorkbenchTextTaskStream(
          brain.vendor,
          { kind: 'prompt_refine', prompt: instruction, extras: { modelKey: brain.modelKey } },
          {
            signal: ctrl.signal,
            onDelta: (delta) => {
              acc += delta
              setScript(stripCodeFences(acc))
            },
          },
        )
        const final = stripCodeFences(acc)
        if (final) setScript(final)
        else setAiError(t('onboardingProviders.customCall.aiEmpty'))
      } catch (e) {
        if (e instanceof DOMException && e.name === 'AbortError') return
        setAiError(e instanceof Error ? e.message : String(e))
      } finally {
        setAiRunning(false)
        abortRef.current = null
      }
    },
    [target, bridge, aiRunning, material, script, t],
  )

  const runTest = React.useCallback(async () => {
    if (!target || test.phase === 'running') return
    setTest({ phase: 'running' })
    try {
      const result = await testRunCustomCall({
        vendorKey: target.vendorKey,
        modelKey: target.modelKey,
        script,
      })
      setTest({ phase: 'done', ...result })
    } catch (e) {
      setTest({
        phase: 'done',
        ok: false,
        assets: [],
        errorMessage: e instanceof Error ? e.message : String(e),
        transcript: [],
        durationMs: 0,
      })
    }
  }, [target, script, test.phase])

  const save = React.useCallback(() => {
    if (!target) return
    setSaveError('')
    try {
      upsertCustomCallModel({
        vendorKey: target.vendorKey,
        modelKey: target.modelKey,
        script,
      })
      onSaved()
      onClose()
    } catch (e) {
      setSaveError(
        t('onboardingProviders.customCall.saveFailed', { message: e instanceof Error ? e.message : String(e) }),
      )
    }
  }, [target, script, onSaved, onClose, t])

  const removeScript = React.useCallback(async () => {
    if (!target) return
    const ok = await confirmDialog({
      title: t('onboardingProviders.customCall.removeConfirmTitle'),
      message: t('onboardingProviders.customCall.removeConfirmMessage', { name: target.label }),
      confirmLabel: t('onboardingProviders.customCall.removeScript'),
      danger: true,
    })
    if (!ok) return
    try {
      upsertCustomCallModel({ vendorKey: target.vendorKey, modelKey: target.modelKey, script: '' })
      onSaved()
      onClose()
    } catch (e) {
      setSaveError(
        t('onboardingProviders.customCall.saveFailed', { message: e instanceof Error ? e.message : String(e) }),
      )
    }
  }, [target, onSaved, onClose, t])

  const insertTemplate = React.useCallback(
    (id: string) => {
      const tpl = contract?.templates.find((item) => item.id === id)
      if (tpl) setScript(tpl.script)
    },
    [contract],
  )

  const varNames = contract?.variables.map((v) => v.name) ?? []

  return (
    <DesignModal
      opened={target !== null}
      onClose={onClose}
      centered
      size={640}
      title={
        <span className="flex items-baseline gap-2">
          <span className="text-body font-semibold text-nomi-ink">{t('onboardingProviders.customCall.title')}</span>
          <span className="text-caption text-nomi-ink-60">{target?.label}</span>
        </span>
      }
      classNames={{ content: 'workbench-shell' }}
      closeButtonProps={{ 'aria-label': t('onboardingProviders.customCall.closeAria') }}
    >
      {target ? (
        <div className="flex flex-col gap-3">
          <div className="text-caption text-nomi-ink-60 -mt-1">{t('onboardingProviders.customCall.subtitle')}</div>

          {/* ① 贴材料 + AI 生成 */}
          <div className="flex flex-col gap-1.5">
            <div className="text-body-sm font-semibold text-nomi-ink">
              {t('onboardingProviders.customCall.materialLabel')}
              <span className="ml-1.5 font-normal text-caption text-nomi-ink-40">
                {t('onboardingProviders.customCall.materialHint')}
              </span>
            </div>
            <textarea
              rows={3}
              className={cn(inputCls, 'resize-y font-nomi-mono text-caption leading-relaxed')}
              placeholder={t('onboardingProviders.customCall.materialPlaceholder')}
              aria-label={t('onboardingProviders.customCall.materialLabel')}
              value={material}
              onChange={(e) => setMaterial(e.currentTarget.value)}
            />
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => void runAi()}
                className={cn(
                  'inline-flex h-8 items-center gap-1.5 rounded-nomi-sm px-3 text-body-sm font-semibold',
                  aiRunning
                    ? 'bg-nomi-ink-05 text-nomi-ink-60'
                    : 'bg-nomi-ink text-nomi-paper hover:bg-nomi-accent',
                )}
              >
                <IconSparkles size={14} stroke={1.7} />
                {aiRunning ? t('onboardingProviders.customCall.aiStop') : t('onboardingProviders.customCall.aiGenerate')}
              </button>
              {aiError ? <span className="min-w-0 flex-1 text-caption text-workbench-danger">{aiError}</span> : null}
            </div>
          </div>

          {/* ② 脚本 */}
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center gap-2">
              <span className="text-body-sm font-semibold text-nomi-ink">
                {t('onboardingProviders.customCall.scriptLabel')}
              </span>
              <span className="min-w-0 flex-1" />
              <span className="text-micro text-nomi-ink-40">{t('onboardingProviders.customCall.templatesLabel')}</span>
              {(contract?.templates ?? []).map((tpl) => (
                <button
                  key={tpl.id}
                  type="button"
                  onClick={() => insertTemplate(tpl.id)}
                  className="rounded-full border border-nomi-line px-2 py-[2px] text-micro text-nomi-ink-60 hover:border-nomi-ink-20 hover:text-nomi-ink"
                >
                  {t(`onboardingProviders.customCall.template.${tpl.id}` as 'onboardingProviders.customCall.template.openaiImage')}
                </button>
              ))}
            </div>
            <textarea
              rows={10}
              spellCheck={false}
              className={cn(inputCls, 'resize-y font-nomi-mono text-caption leading-relaxed')}
              placeholder={t('onboardingProviders.customCall.scriptPlaceholder')}
              aria-label={t('onboardingProviders.customCall.scriptAria', { name: target.label })}
              value={script}
              onChange={(e) => setScript(e.currentTarget.value)}
            />
            <details className="text-caption text-nomi-ink-60">
              <summary className="cursor-pointer select-none text-micro text-nomi-ink-40">
                {t('onboardingProviders.customCall.varsLabel')}：{varNames.join(' · ')}
              </summary>
              <ul className="mt-1.5 flex flex-col gap-1 pl-1">
                {varNames.map((name) => (
                  <li key={name} className="leading-snug">
                    <code className="rounded-nomi-sm bg-nomi-ink-05 px-1 py-[1px] font-nomi-mono text-micro text-nomi-ink-80">
                      {name}
                    </code>{' '}
                    {t(`onboardingProviders.customCall.vars.${name}` as 'onboardingProviders.customCall.vars.prompt')}
                  </li>
                ))}
              </ul>
            </details>
          </div>

          {/* ③ 试跑 */}
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={test.phase === 'running' || !script.trim()}
                onClick={() => void runTest()}
                className={cn(
                  'inline-flex h-8 items-center gap-1.5 rounded-nomi-sm border border-nomi-line px-3 text-body-sm font-semibold text-nomi-ink',
                  'hover:border-nomi-accent hover:text-nomi-accent disabled:cursor-not-allowed disabled:opacity-50',
                )}
              >
                <IconPlayerPlay size={14} stroke={1.7} />
                {test.phase === 'running'
                  ? t('onboardingProviders.customCall.testRunning')
                  : t('onboardingProviders.customCall.testRun')}
              </button>
            </div>

            {test.phase === 'done' ? (
              <div
                className={cn(
                  'flex flex-col gap-2 rounded-nomi-sm border p-2.5',
                  test.ok
                    ? 'border-[var(--workbench-success-soft)] bg-workbench-success-soft'
                    : 'border-[var(--workbench-danger-soft)] bg-[color-mix(in_srgb,var(--workbench-danger)_6%,var(--nomi-paper))]',
                )}
              >
                <div
                  className={cn(
                    'flex items-center gap-1.5 text-body-sm font-semibold',
                    test.ok ? 'text-workbench-success' : 'text-workbench-danger',
                  )}
                >
                  {test.ok ? <IconCheck size={15} stroke={2} /> : <IconAlertTriangle size={15} stroke={1.8} />}
                  {test.ok
                    ? t('onboardingProviders.customCall.testOk', {
                        count: test.assets.length,
                        seconds: (test.durationMs / 1000).toFixed(1),
                      })
                    : t('onboardingProviders.customCall.testFailed')}
                </div>
                {!test.ok && test.errorMessage ? (
                  <div className="select-text break-words rounded-nomi-sm bg-nomi-ink-05 p-2 font-nomi-mono text-micro text-nomi-ink-80">
                    {test.errorMessage}
                  </div>
                ) : null}
                {test.ok && test.assets.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {test.assets.slice(0, 4).map((asset, i) =>
                      /^data:image|\.(png|jpe?g|webp)(\?|$)/i.test(asset) || asset.startsWith('data:image') ? (
                        <img
                          key={i}
                          src={asset}
                          alt=""
                          className="h-16 w-16 rounded-nomi-sm border border-nomi-line object-cover"
                        />
                      ) : (
                        <span
                          key={i}
                          className="max-w-full truncate rounded-nomi-sm bg-nomi-ink-05 px-2 py-1 font-nomi-mono text-micro text-nomi-ink-60"
                        >
                          {asset}
                        </span>
                      ),
                    )}
                  </div>
                ) : null}
                {test.transcript.length === 0 ? (
                  <div className="text-micro text-nomi-ink-40">{t('onboardingProviders.customCall.transcriptEmpty')}</div>
                ) : (
                  test.transcript.map((entry, i) => (
                    <details key={i} className="text-caption text-nomi-ink-80">
                      <summary className="cursor-pointer select-none truncate text-micro text-nomi-ink-60">
                        {t('onboardingProviders.customCall.transcriptRequest', {
                          index: i + 1,
                          method: entry.method,
                          url: entry.url,
                        })}
                        {entry.status === 'error' ? ' ✗' : ''}
                      </summary>
                      <div className="mt-1 flex flex-col gap-1">
                        {entry.requestPreview ? (
                          <div className="select-text break-all rounded-nomi-sm bg-nomi-ink-05 p-1.5 font-nomi-mono text-micro">
                            <span className="text-nomi-ink-40">{t('onboardingProviders.customCall.transcriptRequestBody')}：</span>
                            {entry.requestPreview}
                          </div>
                        ) : null}
                        {entry.responsePreview ? (
                          <div className="select-text break-all rounded-nomi-sm bg-nomi-ink-05 p-1.5 font-nomi-mono text-micro">
                            <span className="text-nomi-ink-40">{t('onboardingProviders.customCall.transcriptResponse')}：</span>
                            {entry.responsePreview}
                          </div>
                        ) : null}
                        {entry.errorMessage ? (
                          <div className="select-text break-all rounded-nomi-sm bg-nomi-ink-05 p-1.5 font-nomi-mono text-micro text-workbench-danger">
                            <span className="text-nomi-ink-40">{t('onboardingProviders.customCall.transcriptError')}：</span>
                            {entry.errorMessage}
                          </div>
                        ) : null}
                      </div>
                    </details>
                  ))
                )}
                {!test.ok ? (
                  <button
                    type="button"
                    onClick={() => void runAi({ lastError: [test.errorMessage, ...test.transcript.map((e) => e.errorMessage)].filter(Boolean).join('\n') })}
                    className="self-start inline-flex h-7 items-center gap-1.5 rounded-nomi-sm bg-nomi-ink px-2.5 text-caption font-semibold text-nomi-paper hover:bg-nomi-accent"
                  >
                    <IconSparkles size={13} stroke={1.7} />
                    {t('onboardingProviders.customCall.aiRepair')}
                  </button>
                ) : null}
              </div>
            ) : null}
          </div>

          <div className="text-micro leading-relaxed text-nomi-ink-40">{t('onboardingProviders.customCall.honestNote')}</div>
          {saveError ? <div className="text-caption text-workbench-danger">{saveError}</div> : null}

          {/* footer */}
          <div className="flex items-center gap-3 border-t border-nomi-line-soft pt-3">
            <button
              type="button"
              onClick={save}
              className="inline-flex h-8 items-center rounded-nomi-sm bg-nomi-ink px-4 text-body-sm font-semibold text-nomi-paper hover:bg-nomi-accent"
            >
              {t('onboardingProviders.customCall.save')}
            </button>
            <button type="button" onClick={onClose} className="text-caption text-nomi-ink-40 hover:text-nomi-ink-60">
              {t('common.cancel')}
            </button>
            <span className="min-w-0 flex-1" />
            {target.script ? (
              <button
                type="button"
                onClick={() => void removeScript()}
                className="text-caption text-workbench-danger hover:underline"
              >
                {t('onboardingProviders.customCall.removeScript')}
              </button>
            ) : null}
          </div>
        </div>
      ) : (
        <span />
      )}
    </DesignModal>
  )
}
