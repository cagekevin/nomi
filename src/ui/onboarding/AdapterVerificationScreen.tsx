import React from 'react'
import { Group, Stack, Text } from '@mantine/core'
import { IconAlertTriangle, IconCheck, IconLoader2, IconRefresh } from '@tabler/icons-react'
import { useTranslation } from 'react-i18next'
import type { DesktopAdapterModeResult, DesktopProviderAdapterRun } from '../../desktop/bridge'
import { DesignButton } from '../../design'
import { cn } from '../../utils/cn'
import { adapterRunProgress, isAdapterRunTerminal } from './adapterVerificationViewModel'

const MODE_LABEL_KEYS: Record<string, string> = {
  chat: 'chat',
  prompt_refine: 'prompt_refine',
  text_to_image: 'text_to_image',
  image_edit: 'image_edit',
  text_to_video: 'text_to_video',
  image_to_video: 'image_to_video',
  text_to_audio: 'text_to_audio',
  image_to_audio: 'image_to_audio',
  transcribe: 'transcribe',
  text_to_3d: 'text_to_3d',
  image_to_3d: 'image_to_3d',
}
function modeTone(mode: DesktopAdapterModeResult): string {
  if (mode.state === 'verified') return 'bg-workbench-success-soft text-workbench-success'
  if (mode.state === 'failed') return 'bg-[var(--workbench-danger-soft)] text-workbench-danger'
  return 'bg-nomi-ink-05 text-nomi-ink-60'
}

function modelState(model: DesktopProviderAdapterRun['models'][number]): 'working' | 'verified' | 'partial' | 'failed' {
  if (model.modes.some(mode => mode.state === 'testing' || mode.state === 'repairing' || mode.state === 'queued')) return 'working'
  const passed = model.modes.filter(mode => mode.state === 'verified').length
  if (passed === model.modes.length && passed > 0) return 'verified'
  if (passed > 0) return 'partial'
  return model.modes.length > 0 ? 'failed' : 'working'
}

export function AdapterVerificationScreen({
  run,
  onClose,
  onBack,
}: {
  run: DesktopProviderAdapterRun
  onClose: () => void
  onBack: () => void
}): JSX.Element {
  const { t } = useTranslation()
  const progress = adapterRunProgress(run)
  const terminal = isAdapterRunTerminal(run.stage)
  const progressWidth = progress.total > 0 ? `${Math.round((progress.completed / progress.total) * 100)}%` : '0%'
  const success = run.stage === 'completed' || run.stage === 'partial'

  return (
    <Stack gap={12}>
      <Group gap={10} wrap="nowrap" align="center">
        <span
          className={cn(
            'size-9 rounded-full grid place-items-center shrink-0',
            success
              ? 'bg-workbench-success-soft text-workbench-success'
              : terminal
                ? 'bg-[var(--workbench-danger-soft)] text-workbench-danger'
                : 'bg-nomi-accent-soft text-nomi-accent',
          )}
        >
          {success ? <IconCheck size={19} stroke={2} /> : terminal ? <IconAlertTriangle size={18} stroke={1.8} /> : <IconLoader2 size={18} stroke={1.8} className="animate-spin" />}
        </span>
        <div className="min-w-0 flex-1">
          <Text size="md" fw={600} c="var(--nomi-ink)">
            {t(`onboardingProviders.adapterVerification.title.${terminal ? 'result' : 'running'}`)}
          </Text>
          <Text size="xs" c="var(--nomi-ink-60)" truncate>
            {terminal
              ? t('onboardingProviders.adapterVerification.resultSummary', { verified: progress.verified, total: progress.total })
              : t(`onboardingProviders.adapterVerification.stage.${run.stage}`, { model: run.currentModelKey || '' })}
          </Text>
        </div>
      </Group>

      <div>
        <Group justify="space-between" align="center" mb={5}>
          <Text size="xs" c="var(--nomi-ink-60)">
            {t('onboardingProviders.adapterVerification.progress', { completed: progress.completed, total: progress.total })}
          </Text>
          {!terminal && run.repairAttempt > 0 ? (
            <Group gap={4} wrap="nowrap">
              <IconRefresh size={12} stroke={1.8} className="text-nomi-accent" />
              <Text size="xs" c="var(--nomi-accent)">
                {t('onboardingProviders.adapterVerification.repairing', { attempt: run.repairAttempt })}
              </Text>
            </Group>
          ) : null}
        </Group>
        <div className="h-1.5 rounded-full bg-nomi-ink-10 overflow-hidden">
          <div className="h-full rounded-full bg-nomi-accent transition-[width] duration-300" style={{ width: progressWidth }} />
        </div>
      </div>

      <Stack gap={6} mah={300} style={{ overflowY: 'auto' }}>
        {run.models.map(model => {
          const state = modelState(model)
          const passed = model.modes.filter(mode => mode.state === 'verified').length
          return (
            <div key={model.modelKey} className="rounded-nomi border border-nomi-line bg-nomi-paper px-3 py-2.5">
              <Group justify="space-between" wrap="nowrap" align="center" gap={8}>
                <div className="min-w-0 flex-1">
                  <Text size="sm" fw={600} c="var(--nomi-ink)" truncate>{model.labelZh}</Text>
                  <Text size="xs" c="var(--nomi-ink-40)" truncate>{model.modelKey}</Text>
                </div>
                <span
                  className={cn(
                    'inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-micro font-semibold shrink-0',
                    state === 'verified'
                      ? 'bg-workbench-success-soft text-workbench-success'
                      : state === 'failed'
                        ? 'bg-[var(--workbench-danger-soft)] text-workbench-danger'
                        : state === 'partial'
                          ? 'bg-nomi-accent-soft text-nomi-accent'
                          : 'bg-nomi-ink-05 text-nomi-ink-60',
                  )}
                >
                  {state === 'working' ? <IconLoader2 size={11} className="animate-spin" /> : null}
                  {t(`onboardingProviders.adapterVerification.modelState.${state}`, { passed, total: model.modes.length })}
                </span>
              </Group>
              {model.modes.length > 0 ? (
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {model.modes.map(mode => (
                    <span key={mode.taskKind} title={mode.error} className={cn('px-2 py-1 rounded-full text-micro', modeTone(mode))}>
                      {t(`onboardingProviders.adapterVerification.mode.${MODE_LABEL_KEYS[mode.taskKind] || mode.taskKind}`)}
                    </span>
                  ))}
                </div>
              ) : null}
            </div>
          )
        })}
      </Stack>

      {run.error ? (
        <Text size="xs" c="var(--workbench-danger)" className="rounded-nomi bg-[var(--workbench-danger-soft)] px-3 py-2">
          {run.error}
        </Text>
      ) : !terminal ? (
        <Text size="xs" c="var(--nomi-ink-40)">
          {t('onboardingProviders.adapterVerification.backgroundHint')}
        </Text>
      ) : run.stage === 'partial' ? (
        <Text size="xs" c="var(--nomi-ink-60)">
          {t('onboardingProviders.adapterVerification.partialHint')}
        </Text>
      ) : null}

      <Group justify="flex-end" gap={8}>
        {terminal && !success ? <DesignButton variant="subtle" onClick={onBack}>{t('modelSetup.retryEdit')}</DesignButton> : null}
        <DesignButton variant={terminal ? 'filled' : 'subtle'} onClick={onClose}>
          {terminal ? t('modelSetup.done') : t('onboardingProviders.adapterVerification.runInBackground')}
        </DesignButton>
      </Group>
    </Stack>
  )
}
