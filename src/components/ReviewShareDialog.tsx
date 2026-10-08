import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { format } from 'date-fns'
import { useTaskStore } from '../store/taskStore'
import type { ReviewInsight, WeekReview } from '../lib/weekReview'
import type { ReviewPeriod } from '../lib/reviewPeriod'
import { reviewPeriodDays } from '../lib/reviewPeriod'
import {
  buildReviewImageModel,
  canShareImageFile,
  renderReviewImage,
  reviewShareText,
  shareableInsight,
  shareOrSaveImage,
  type ReviewImageModel,
} from '../lib/reviewImage'
import { downloadBlob } from '../lib/downloadFile'
import { recordLabelKeyHex } from '../lib/logCategoryColors'
import { recordLabelKeyText } from '../lib/todoColorLabels'
import { dateFnsLocale, fromDateKey, toDateKey } from '../lib/dateKey'
import { formatDuration, formatDurationShort } from '../lib/timeGrid'
import { useDateFormat } from '../hooks/useDateFormat'
import { Modal, ModalTitle } from './ui/Modal'
import { Switch } from './settings/SettingsPrimitives'
import { buttonClass } from './ui/buttonClass'
import { HINT_TEXT, META_TEXT } from './ui/textClass'

/** 「ラベル名を隠す」を端末に覚える（人に見せる画像の選択なので同期しない） */
const CHOICE_KEY = 'chronograma-review-share-v1'

function readHideLabels(): boolean {
  try {
    const raw = JSON.parse(globalThis.localStorage?.getItem(CHOICE_KEY) ?? 'null') as { hideLabels?: unknown } | null
    return raw?.hideLabels === true
  } catch {
    return false
  }
}

function saveHideLabels(hideLabels: boolean) {
  try {
    globalThis.localStorage?.setItem(CHOICE_KEY, JSON.stringify({ hideLabels }))
  } catch {
    /* 覚えられなくても今回の共有はできる */
  }
}

/**
 * ふりかえりを 1 枚の画像にして共有・保存する前の見本（#283）。
 * 画像の見本を出し、「ラベル名を隠す」（色と時間だけ）と「一言を入れる」を選んでから、
 * スマホは端末の共有に、共有できない環境（PC のブラウザの多く）は画像を保存する。画像は端末の中で作り、サーバーには送らない
 */
export function ReviewShareDialog({
  review,
  period,
  periodStart,
  current,
  insight,
  insightText,
  onClose,
}: {
  review: WeekReview
  period: ReviewPeriod
  periodStart: Date
  /** 今の期間か（共有の文が「今週の記録」か「◯月◯日〜の記録」か） */
  current: boolean
  insight: ReviewInsight
  /** 一言を文にする（カードの一言と同じ書き方） */
  insightText: (insight: ReviewInsight) => string
  onClose: () => void
}) {
  const { t, i18n } = useTranslation()
  const df = useDateFormat()
  const dateLocale = dateFnsLocale(i18n.resolvedLanguage)
  const labelPresets = useTaskStore((s) => s.timeLogTagPresets)
  const logCategoryColors = useTaskStore((s) => s.logCategoryColors)
  const titleId = useId()
  const shareRef = useRef<HTMLButtonElement>(null)

  const [hideLabels, setHideLabels] = useState(readHideLabels)
  const [withInsight, setWithInsight] = useState(true)
  const imageInsight = shareableInsight(insight, hideLabels)

  // カードは描くたびに新しい Date を渡すので、日付キーで覚える（見本の画像を作り直さない）
  const startKey = toDateKey(periodStart)
  const days = useMemo(() => reviewPeriodDays(period, fromDateKey(startKey)), [period, startKey])
  const periodText =
    period === 'month'
      ? df.yearMonth(days[0]!)
      : t('reviewShare.weekRange', { start: df.monthDayWeekday(days[0]!), end: df.monthDayWeekday(days[days.length - 1]!) })
  const insightLine = withInsight && imageInsight ? insightText(imageInsight) : null

  const model: ReviewImageModel = useMemo(
    () =>
      buildReviewImageModel(review, {
        period,
        dayKeys: days.map(toDateKey),
        hideLabels,
        insight: insightLine,
        texts: {
          title: t(period === 'month' ? 'weekReview.monthTitle' : 'weekReview.title'),
          periodText,
          totalLabel: t('weekReview.logged'),
          perDayLabel: t('weekReview.loggedPerDay'),
          byLabelLabel: t('weekReview.byLabel'),
          otherLabels: t('weekReview.otherLabels'),
          emptyText: t('weekReview.noLogs'),
          brand: 'Chronograma',
        },
        labelText: (tag) => recordLabelKeyText(tag, labelPresets, logCategoryColors, t),
        labelHex: (tag) => recordLabelKeyHex(tag, logCategoryColors),
        duration: formatDuration,
        durationShort: formatDurationShort,
        // 週は曜日、月は 1・8・15・22・29 日だけ（細い棒の下に全部は入らない）
        dayLabel: (_key, i) =>
          period === 'month' ? (i % 7 === 0 ? String(days[i]!.getDate()) : '') : format(days[i]!, 'E', { locale: dateLocale }),
      }),
    [review, period, days, hideLabels, insightLine, periodText, labelPresets, logCategoryColors, t, dateLocale],
  )

  const shareText = reviewShareText(model, {
    lead: (time) =>
      current
        ? t(period === 'month' ? 'reviewShare.leadThisMonth' : 'reviewShare.leadThisWeek', { time })
        : t('reviewShare.leadPeriod', { period: periodText, time }),
    separator: t('reviewShare.textSeparator'),
    open: t('reviewShare.textOpen'),
    close: t('reviewShare.textClose'),
    ellipsis: '…',
  })
  const fileName = `chronograma-review-${period === 'month' ? startKey.slice(0, 7) : startKey}.png`

  // 見本の画像（選び直すたびに作り直す）。作れない環境では作れなかったと出す
  const [image, setImage] = useState<{ blob: Blob; url: string } | null | 'failed'>(null)
  useEffect(() => {
    let alive = true
    let url: string | null = null
    void renderReviewImage(model).then((blob) => {
      if (!alive) return
      if (!blob) {
        setImage('failed')
        return
      }
      url = URL.createObjectURL(blob)
      setImage({ blob, url })
    })
    return () => {
      alive = false
      if (url) URL.revokeObjectURL(url)
    }
  }, [model])
  const ready = image && image !== 'failed' ? image : null
  const canShare = useMemo(
    () => (ready ? canShareImageFile(new File([ready.blob], fileName, { type: ready.blob.type || 'image/png' })) : false),
    [ready, fileName],
  )

  const [busy, setBusy] = useState(false)
  const submit = async () => {
    if (!ready || busy) return
    setBusy(true)
    const result = await shareOrSaveImage(
      ready.blob,
      { fileName, title: model.title, text: shareText },
      { nav: globalThis.navigator, save: downloadBlob },
    )
    setBusy(false)
    if (result !== 'cancelled') onClose()
  }

  return (
    <Modal onClose={onClose} labelledBy={titleId} initialFocus={shareRef} className="p-5">
      <ModalTitle id={titleId}>{t('reviewShare.title')}</ModalTitle>
      <div className="mt-3 overflow-hidden rounded-lg border border-zinc-200 bg-white dark:border-zinc-700">
        {ready ? (
          <img src={ready.url} alt={shareText} className="block h-auto max-h-[52vh] w-full object-contain" />
        ) : (
          <p className={`flex min-h-40 items-center justify-center p-4 ${META_TEXT}`} role={image === 'failed' ? 'alert' : undefined}>
            {image === 'failed' ? t('reviewShare.failed') : t('reviewShare.making')}
          </p>
        )}
      </div>

      <div className="mt-4 space-y-3">
        <div className="flex items-center justify-between gap-3 text-sm text-zinc-700 dark:text-zinc-300">
          <span>{t('reviewShare.hideLabels')}</span>
          <Switch
            checked={hideLabels}
            onChange={(v) => {
              setHideLabels(v)
              saveHideLabels(v)
            }}
            label={t('reviewShare.hideLabels')}
          />
        </div>
        <div>
          <div className="flex items-center justify-between gap-3 text-sm text-zinc-700 dark:text-zinc-300">
            <span>{t('reviewShare.withInsight')}</span>
            <Switch
              checked={withInsight && imageInsight != null}
              onChange={setWithInsight}
              disabled={imageInsight == null}
              label={t('reviewShare.withInsight')}
            />
          </div>
          {imageInsight == null && <p className={`mt-1 ${META_TEXT}`}>{t('reviewShare.insightNamesLabel')}</p>}
        </div>
      </div>

      {/* 何が入って何が入らないか（ラベル名は中身になりうるので隠せる、と同じ場所で） */}
      <p className={`mt-4 ${HINT_TEXT}`}>{t('reviewShare.privacy')}</p>

      <div className="mt-5 flex justify-end gap-2">
        <button type="button" onClick={onClose} className={buttonClass({ variant: 'ghost', size: 'md' })}>
          {t('common.cancel')}
        </button>
        <button
          ref={shareRef}
          type="button"
          onClick={() => void submit()}
          disabled={!ready || busy}
          className={buttonClass({ variant: 'primary', size: 'md' })}
        >
          {canShare ? t('reviewShare.share') : t('reviewShare.save')}
        </button>
      </div>
    </Modal>
  )
}
