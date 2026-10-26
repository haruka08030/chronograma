import { useLayoutEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import i18n from '../i18n/config'
import { useTaskStore } from '../store/taskStore'
import type { SettingsScrollTarget } from '../store/storeTypes'
import { isSupabaseConfigured } from '../lib/supabase'
import { AccountMenu } from './AccountMenu'
import { DailyRhythmSettings } from './DailyRhythmSettings'
import { InstallAppSection } from './InstallAppSection'
import { CategoryManager } from './settings/CategoryManager'
import { MoreIntegrations } from './settings/MoreIntegrations'
import { GoogleCalendarSettings } from './settings/GoogleCalendarSettings'
import { IntegrationsSummary } from './settings/IntegrationsSummary'
import { DataSettingsPage } from './settings/DataSettingsPage'
import { SettingsSubPage } from './settings/SettingsSubPage'
import { TimeZoneSettings } from './settings/TimeZoneSettings'
import { SettingsGroup, SettingsLinkRow, SettingsRow } from './settings/SettingsPrimitives'
import { Segmented } from './ui/Segmented'
import { buttonClass } from './ui/buttonClass'
import { openShortcutsHelp } from '../lib/shortcuts'
import { PAGE_TITLE_CLASS } from './ui/headingClass'
import { PAGE_SCROLL_CLASS } from './ui/layoutClass'
import { useRememberScroll } from '../hooks/useRememberScroll'
import { AddonsSettingsGroup } from './addons/AddonsSettingsGroup'
import { FeedbackRow } from './settings/FeedbackDialog'

/**
 * 設定。上から アカウント → ラベル → 通知・計画 → 時間割 → 日付と時刻 → 外観 → 連携 → データ → アプリ → 規約。
 * 誰として使っているかを先頭に、よく触るもの（記録の分類）を上に、一度決めたら触らないものを下に。
 * どのまとまりも「見出し + 1 枚の枠に行を並べる」形に揃える。
 * 外部連携は使う人だけが使うので、トップには接続中のものだけを出し、つなぐ・設定するのは次のページにする。
 * データ（バックアップ・取り込み・書き出し）もたまにしか使わないので、トップは 1 行にして次のページで開く。
 */
export function SettingsView() {
  const settingsScrollTarget = useTaskStore((s) => s.settingsScrollTarget)
  const [page, setPage] = useState<'main' | 'integrations' | 'data'>(() =>
    isIntegrationTarget(settingsScrollTarget) ? 'integrations' : 'main',
  )

  // 連携（Google カレンダー・Notion・Canvas）への案内は連携のページを開く（届いたときに 1 回だけ切り替える）
  const [seenTarget, setSeenTarget] = useState(settingsScrollTarget)
  if (settingsScrollTarget !== seenTarget) {
    setSeenTarget(settingsScrollTarget)
    if (isIntegrationTarget(settingsScrollTarget)) setPage('integrations')
  }

  if (page === 'integrations') return <IntegrationsPage onBack={() => setPage('main')} />
  if (page === 'data') return <DataSettingsPage onBack={() => setPage('main')} />
  return <MainSettings onOpenIntegrations={() => setPage('integrations')} onOpenData={() => setPage('data')} />
}

const isIntegrationTarget = (target: SettingsScrollTarget | null): target is 'google' | 'notion' | 'canvas' =>
  target === 'google' || target === 'notion' || target === 'canvas'

/** 外部連携のページ。戻るで設定のトップへ */
function IntegrationsPage({ onBack }: { onBack: () => void }) {
  const { t } = useTranslation()
  const settingsScrollTarget = useTaskStore((s) => s.settingsScrollTarget)
  const clearSettingsScrollTarget = useTaskStore((s) => s.clearSettingsScrollTarget)
  const scrollRef = useRef<HTMLDivElement>(null)

  useLayoutEffect(() => {
    if (isIntegrationTarget(settingsScrollTarget)) {
      document.getElementById(`settings-${settingsScrollTarget}`)?.scrollIntoView({ block: 'start' })
      clearSettingsScrollTarget()
    } else {
      scrollRef.current?.scrollTo({ top: 0 })
    }
  }, [settingsScrollTarget, clearSettingsScrollTarget])

  return (
    <SettingsSubPage ref={scrollRef} title={t('integrations.title')} onBack={onBack}>
      <GoogleCalendarSettings />
      <MoreIntegrations />
    </SettingsSubPage>
  )
}

function MainSettings({ onOpenIntegrations, onOpenData }: { onOpenIntegrations: () => void; onOpenData: () => void }) {
  const { t } = useTranslation()
  const theme = useTaskStore((s) => s.theme)
  const setTheme = useTaskStore((s) => s.setTheme)
  const settingsScrollTarget = useTaskStore((s) => s.settingsScrollTarget)
  const clearSettingsScrollTarget = useTaskStore((s) => s.clearSettingsScrollTarget)
  const lang = i18n.resolvedLanguage?.startsWith('en') ? 'en' : 'ja'

  // 行き先を指定して開いたときは、下の scrollIntoView が後から上書きする
  const scrollRef = useRef<HTMLDivElement>(null)
  useRememberScroll(scrollRef, 'settings')

  useLayoutEffect(() => {
    // Google カレンダーは連携のページで扱う（SettingsView が切り替える）
    if (!settingsScrollTarget || settingsScrollTarget === 'google') return
    const id =
      settingsScrollTarget === 'appearance'
        ? 'settings-appearance'
        : settingsScrollTarget === 'install'
          ? 'settings-app'
          : 'settings-account'
    document.getElementById(id)?.scrollIntoView({ block: 'start' })
    clearSettingsScrollTarget()
  }, [settingsScrollTarget, clearSettingsScrollTarget])

  return (
    <div ref={scrollRef} className={PAGE_SCROLL_CLASS}>
      <div className="mx-auto w-full max-w-2xl space-y-8 px-4 pb-24 pt-6 md:px-6 md:pt-8">
        <h1 className={PAGE_TITLE_CLASS}>{t('settings.title')}</h1>

        <SettingsGroup id="settings-account" title={t('settings.account')}>
          {isSupabaseConfigured ? (
            <div className="px-4 py-3">
              <AccountMenu />
            </div>
          ) : (
            <SettingsRow label={t('settings.syncOffTitle')} help={t('settings.supabaseOff')} />
          )}
        </SettingsGroup>

        {/* 追加機能の画面へ（スマホだけ。下のタブに無いので、ここが入口） */}
        <AddonsSettingsGroup />

        <SettingsGroup id="settings-categories" title={t('categories.title')}>
          <CategoryManager />
        </SettingsGroup>

        <DailyRhythmSettings />

        <TimeZoneSettings />

        <SettingsGroup id="settings-appearance" title={t('settings.appearance')}>
          <SettingsRow label={t('settings.theme')}>
            <Segmented
              ariaLabel={t('settings.theme')}
              value={theme}
              onChange={setTheme}
              options={[
                { value: 'system', label: t('settings.themeSystem') },
                { value: 'light', label: t('settings.themeLight') },
                { value: 'dark', label: t('settings.themeDark') },
              ]}
            />
          </SettingsRow>
          <SettingsRow label={t('settings.language')}>
            <Segmented
              ariaLabel={t('settings.language')}
              value={lang}
              onChange={(v) => void i18n.changeLanguage(v)}
              options={[
                { value: 'ja', label: '日本語' },
                { value: 'en', label: 'English' },
              ]}
            />
          </SettingsRow>
          {/* キーボードのある環境だけ（タッチだけの端末では使えない） */}
          <div className="hidden [@media(hover:hover)]:block">
            <SettingsRow label={t('settings.shortcuts')}>
              <button type="button" onClick={openShortcutsHelp} className={buttonClass({ variant: 'secondary', size: 'md' })}>
                {t('settings.shortcutsOpen')}
              </button>
            </SettingsRow>
          </div>
        </SettingsGroup>

        <IntegrationsSummary onOpen={onOpenIntegrations} />

        <SettingsGroup id="settings-data" title={t('settings.data')}>
          <SettingsLinkRow label={t('settings.dataOpen')} onClick={onOpenData} />
        </SettingsGroup>

        <SettingsGroup id="settings-app" title={t('settings.appTitle')}>
          <InstallAppSection />
        </SettingsGroup>

        {/* 規約・問い合わせはたまにしか使わないので、見出しを立てず一番下に小さな行で置く。問い合わせの送り先は Supabase なので、無ければ出さない */}
        <SettingsGroup>
          {isSupabaseConfigured && <FeedbackRow />}
          <SettingsLinkRow label={t('settings.privacyPolicy')} href="/privacy.html" />
          <SettingsLinkRow label={t('settings.terms')} href="/terms.html" />
        </SettingsGroup>
      </div>
    </div>
  )
}
