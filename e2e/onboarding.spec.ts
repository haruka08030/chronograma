import { expect, test } from './i18n'

test('はじめて開くと今日の画面に 3 ステップの案内が出て、進むと次のステップに変わり、× で閉じたら読み込み直しても出ない', async ({
  page,
  t,
  ja,
  isMobile,
}) => {
  await page.goto('/')
  const guide = page.getByRole('region', { name: t('onboarding.heading') })
  // 最初の 1 回は dev サーバーが変換するので待つ（WebKit は遅い）
  await expect(guide).toBeVisible({ timeout: 30_000 })
  await expect(guide).toContainText(`${t('onboarding.stepOf', { n: 1, total: 3 })} ${t('onboarding.add')}`)

  // 追加欄の例を押すと欄に入り、Enter で時刻つきの To-Do になる（① と ② が済む）
  const example = t('onboarding.example')
  await page.getByRole('button', { name: t('onboarding.useExample', { text: example }) }).click()
  const input = page.getByPlaceholder(t('onboarding.placeholder', { example: '' }))
  await expect(input).toHaveValue(example)
  await input.press('Enter')
  await expect(guide).toContainText(t('onboarding.stepOf', { n: 3, total: 3 }))

  await guide.getByRole('button', { name: t('onboarding.close') }).click()
  await expect(guide).toHaveCount(0)
  await page.reload()
  // スマホは案内を閉じたあと、締めの時刻からはタイムラインの面で開くので「やること」に替える
  if (isMobile) await page.getByRole('tab', { name: t('planner.paneList') }).click()
  // 例の題名（時刻を除いた部分）の行が残っている
  await expect(page.getByRole('option', { name: ja ? 'バイト' : 'essay' })).toBeVisible()
  await expect(page.getByRole('region', { name: t('onboarding.heading') })).toHaveCount(0)
})
