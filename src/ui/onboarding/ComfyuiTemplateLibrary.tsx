/**
 * ComfyUI 模板库（T2 · 2026-08-02 拍板，四幕样张第①幕）。
 *
 * 用户摩擦：装完 ComfyUI 打开 Nomi 只看到一个写死的「本地·文生图」，不知道这台机器还能干什么——
 * 而他自己的 ComfyUI 里躺着几百个官方模板。这里把**他已有的东西给他看见**：
 * 分类 chip → 列表（标题+一句话）→ 点开当场对账缺件（缺哪个文件/放哪/去哪下）→ 就绪才给启用。
 *
 * 关键：模板不是我们维护的，是读他 ComfyUI 的（他装了什么就看到什么、随 ComfyUI 更新、我们零维护）。
 * 官方模板是界面格式 → 取详情时经 comfyuiGraphConvert 借 ComfyUI 自己的前端转 API（T1）。
 * 缺件闸/启用链全部复用既有（reconcile + importComfyWorkflow），不复制逻辑（P1）。
 */
import React from 'react'
import { useTranslation } from 'react-i18next'
import { IconBooks, IconCheck, IconX, IconExternalLink, IconRefresh, IconAlertTriangle, IconSearch } from '@tabler/icons-react'
import { cn } from '../../utils/cn'
import { getDesktopBridge } from '../../desktop/bridge'
import { toast } from '../toast'

type TemplateEntry = {
  name: string; title: string; description: string; group: string; groupType: string
  tags: string[]; tutorialUrl: string; thumbnailUrl: string
}
type Detail = {
  apiText: string
  unknownNodeTypes: string[]
  missingEnumValues: Array<{ classType: string; inputKey: string; value: string }>
  enumOptions: Array<{ classType: string; inputKey: string; options: string[] }>
  serverReachable: boolean
}

type Props = {
  vendorKey: string
  /** 已启用的模型名（判重复）。 */
  modelLabels: string[]
  onImported: () => void
}

/** 一次展示多少条（几百条全渲染会卡；用户靠分类+搜索收窄，不需要无限滚动）。 */
const PAGE_SIZE = 12

export function ComfyuiTemplateLibrary({ vendorKey, modelLabels, onImported }: Props): JSX.Element | null {
  const { t } = useTranslation()
  const catalog = getDesktopBridge()?.modelCatalog
  const [list, setList] = React.useState<TemplateEntry[] | null | 'loading'>('loading')
  const [group, setGroup] = React.useState<string>('')
  const [query, setQuery] = React.useState('')
  const [openName, setOpenName] = React.useState<string | null>(null)
  const [detail, setDetail] = React.useState<Detail | 'loading' | { error: string } | null>(null)
  const [busy, setBusy] = React.useState(false)
  const [limit, setLimit] = React.useState(PAGE_SIZE)

  const load = React.useCallback(() => {
    const call = catalog?.listComfyuiTemplates
    if (!call) { setList(null); return }
    setList('loading')
    void call(vendorKey)
      .then((r) => setList((r as TemplateEntry[]) ?? null))
      .catch(() => setList(null))
  }, [catalog, vendorKey])

  React.useEffect(() => { load() }, [load])

  const groups = React.useMemo(() => {
    if (!Array.isArray(list)) return []
    const counts = new Map<string, number>()
    for (const item of list) counts.set(item.group, (counts.get(item.group) ?? 0) + 1)
    // 视频/图片这类大组排前（用户最常要的），其余按数量降序。
    return [...counts.entries()].sort((a, b) => b[1] - a[1])
  }, [list])

  const filtered = React.useMemo(() => {
    if (!Array.isArray(list)) return []
    const q = query.trim().toLowerCase()
    return list.filter((item) => {
      if (group && item.group !== group) return false
      if (!q) return true
      return `${item.title} ${item.description} ${item.tags.join(' ')}`.toLowerCase().includes(q)
    })
  }, [list, group, query])

  const openDetail = React.useCallback((name: string) => {
    if (openName === name) { setOpenName(null); setDetail(null); return }
    setOpenName(name)
    const call = catalog?.getComfyuiTemplateDetail
    if (!call) { setDetail({ error: t('onboardingProviders.comfyTemplates.unsupported') }); return }
    setDetail('loading')
    void call(name, vendorKey)
      .then((r) => setDetail((r as Detail | { error: string }) ?? { error: t('onboardingProviders.comfyTemplates.detailFailed') }))
      .catch((e) => setDetail({ error: e instanceof Error ? e.message : String(e) }))
  }, [catalog, openName, vendorKey, t])

  if (!catalog) return null
  if (list === null) return null // 这台 ComfyUI 没有模板包/没连上 → 整块不出现（不占位、不报错）

  const enable = (entry: TemplateEntry, d: Detail) => {
    if (!catalog.importComfyWorkflow) return
    setBusy(true)
    try {
      // 官方模板的绑定交给既有分析器推导（它已能认 86% 的提示词/90% 的输出）。
      const analyzed = catalog.analyzeComfyWorkflow?.(d.apiText)
      if (!analyzed || !analyzed.ok) { toast(t('onboardingProviders.comfyTemplates.analyzeFailed'), 'error'); return }
      const binding = (analyzed.analysis as { suggested?: unknown }).suggested
      const r = catalog.importComfyWorkflow({ text: d.apiText, binding, labelZh: entry.title, enumOptions: d.enumOptions, vendorKey })
      if (!r.ok) { toast(r.error, 'error'); return }
      toast(t('onboardingProviders.comfyTemplates.enabled', { name: entry.title }), 'success')
      onImported()
    } finally { setBusy(false) }
  }

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-1.5">
        <IconBooks size={13} stroke={1.7} className="text-nomi-ink-40" />
        <span className="text-micro text-nomi-ink-30 flex-1">
          {list === 'loading'
            ? t('onboardingProviders.comfyTemplates.loading')
            : t('onboardingProviders.comfyTemplates.sectionTitle', { count: list.length })}
        </span>
        <button
          type="button" onClick={load}
          className="inline-flex items-center gap-1 text-micro text-nomi-ink-30 hover:text-nomi-accent"
        >
          <IconRefresh size={11} stroke={1.7} />{t('onboardingProviders.comfyTemplates.refresh')}
        </button>
      </div>

      {list === 'loading' ? null : (
        <>
          <div className="flex flex-wrap gap-1">
            <CatChip active={group === ''} onClick={() => { setGroup(''); setLimit(PAGE_SIZE) }} label={t('onboardingProviders.comfyTemplates.allGroups')} />
            {groups.map(([name, count]) => (
              <CatChip key={name} active={group === name} onClick={() => { setGroup(name); setLimit(PAGE_SIZE) }} label={`${name} ${count}`} />
            ))}
          </div>

          <div className="flex items-center gap-1.5 h-7 px-2 rounded-nomi-sm border border-nomi-line bg-nomi-paper">
            <IconSearch size={12} stroke={1.7} className="text-nomi-ink-30 shrink-0" />
            <input
              value={query}
              onChange={(e) => { setQuery(e.target.value); setLimit(PAGE_SIZE) }}
              placeholder={t('onboardingProviders.comfyTemplates.searchPlaceholder')}
              aria-label={t('onboardingProviders.comfyTemplates.searchAria')}
              className="flex-1 min-w-0 bg-transparent text-caption text-nomi-ink placeholder:text-nomi-ink-30 outline-none"
            />
          </div>

          <div className="flex flex-col gap-px">
            {filtered.slice(0, limit).map((entry) => {
              const already = modelLabels.includes(entry.title)
              const open = openName === entry.name
              return (
                <React.Fragment key={entry.name}>
                  <button
                    type="button"
                    onClick={() => openDetail(entry.name)}
                    aria-expanded={open}
                    className={cn('flex items-center gap-2 px-2 py-1.5 rounded-nomi-sm text-left hover:bg-nomi-ink-05',
                      open && 'bg-nomi-ink-05')}
                  >
                    <span className="flex-1 min-w-0">
                      <span className="block text-caption text-nomi-ink truncate">{entry.title}</span>
                      {entry.description ? <span className="block text-micro text-nomi-ink-30 truncate">{entry.description}</span> : null}
                    </span>
                    {already ? (
                      <span className="text-micro text-nomi-accent bg-nomi-accent-soft px-2 py-0.5 rounded-full shrink-0">
                        {t('onboardingProviders.comfyTemplates.chipEnabled')}
                      </span>
                    ) : null}
                  </button>
                  {open ? <TemplateDetailBlock entry={entry} detail={detail} busy={busy} onEnable={enable} /> : null}
                </React.Fragment>
              )
            })}
          </div>

          {filtered.length > limit ? (
            <button
              type="button" onClick={() => setLimit((n) => n + PAGE_SIZE)}
              className="self-start text-micro text-nomi-ink-40 hover:text-nomi-accent"
            >
              {t('onboardingProviders.comfyTemplates.showMore', { rest: filtered.length - limit })}
            </button>
          ) : null}
          {filtered.length === 0 ? (
            <div className="text-micro text-nomi-ink-30 px-2 py-1">{t('onboardingProviders.comfyTemplates.noMatch')}</div>
          ) : null}
        </>
      )}
    </div>
  )
}

function CatChip({ active, label, onClick }: { active: boolean; label: string; onClick: () => void }): JSX.Element {
  return (
    <button
      type="button" onClick={onClick}
      className={cn('text-micro px-2 py-0.5 rounded-nomi-sm border',
        active ? 'bg-nomi-ink text-nomi-paper border-nomi-ink' : 'bg-nomi-paper text-nomi-ink-60 border-nomi-line hover:border-nomi-accent')}
    >
      {label}
    </button>
  )
}

/** 展开块：转换中 / 缺件清单 / 就绪可启用。缺件时按钮不给点（这就是「缺件闸」）。 */
function TemplateDetailBlock({
  entry, detail, busy, onEnable,
}: {
  entry: TemplateEntry
  detail: Detail | 'loading' | { error: string } | null
  busy: boolean
  onEnable: (entry: TemplateEntry, d: Detail) => void
}): JSX.Element {
  const { t } = useTranslation()
  if (detail === 'loading' || detail === null) {
    return <div className="px-4 py-1.5 text-micro text-nomi-ink-40">{t('onboardingProviders.comfyTemplates.preparing')}</div>
  }
  if ('error' in detail) {
    return (
      <div className="mx-2 mb-1 flex items-start gap-2 rounded-nomi-sm bg-[var(--workbench-danger-soft)] px-2.5 py-2">
        <IconAlertTriangle size={13} className="shrink-0 mt-0.5 text-workbench-danger" />
        <span className="text-micro text-nomi-ink leading-relaxed">{detail.error}</span>
      </div>
    )
  }
  const missingFiles = detail.missingEnumValues
  const missingNodes = detail.unknownNodeTypes
  const ready = detail.serverReachable && missingFiles.length === 0 && missingNodes.length === 0
  return (
    <div className="px-4 pb-2 flex flex-col gap-1">
      {!detail.serverReachable ? (
        <span className="text-micro text-nomi-ink-40">{t('onboardingProviders.comfyTemplates.offline')}</span>
      ) : null}
      {missingNodes.length > 0 ? (
        <span className="text-micro text-workbench-danger">
          {t('onboardingProviders.comfyTemplates.missingNodes', { list: missingNodes.slice(0, 3).join(' · ') })}
        </span>
      ) : null}
      {missingFiles.slice(0, 5).map((m, i) => (
        <div key={`${m.classType}-${m.inputKey}-${i}`} className="flex items-center gap-1.5 text-micro min-w-0">
          <IconX size={11} className="text-workbench-danger shrink-0" />
          <code className="flex-1 min-w-0 truncate font-mono text-nomi-ink-60" title={m.value}>{m.value}</code>
        </div>
      ))}
      {missingFiles.length > 5 ? (
        <span className="text-micro text-nomi-ink-30">{t('onboardingProviders.comfyTemplates.moreMissing', { rest: missingFiles.length - 5 })}</span>
      ) : null}
      {ready ? (
        <div className="flex items-center gap-1.5 text-micro text-workbench-success">
          <IconCheck size={11} />{t('onboardingProviders.comfyTemplates.allReady')}
        </div>
      ) : null}
      <div className="flex items-center gap-2 pt-0.5">
        <button
          type="button"
          disabled={!ready || busy}
          onClick={() => onEnable(entry, detail)}
          className={cn('inline-flex items-center h-7 px-3 rounded-nomi-sm bg-nomi-ink text-nomi-paper',
            'text-micro font-medium hover:bg-nomi-accent disabled:opacity-45')}
        >
          {t('onboardingProviders.comfyTemplates.enableButton')}
        </button>
        {entry.tutorialUrl ? (
          <button
            type="button"
            onClick={() => window.open(entry.tutorialUrl, '_blank', 'noopener')}
            className="inline-flex items-center gap-1 text-micro text-nomi-ink-40 hover:text-nomi-accent"
          >
            {t('onboardingProviders.comfyTemplates.tutorial')}<IconExternalLink size={10} stroke={1.6} />
          </button>
        ) : null}
        {!ready && detail.serverReachable ? (
          <span className="text-micro text-nomi-ink-30">{t('onboardingProviders.comfyTemplates.gateNote')}</span>
        ) : null}
      </div>
    </div>
  )
}
