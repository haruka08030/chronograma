# Chronograma

学生向けの、1 日を計画して・記録して・ふりかえる Web アプリ（React + TypeScript + Zustand + Tailwind、PWA。同期は Supabase）。

## 先に読むもの

| ファイル | 中身 |
| --- | --- |
| [`doc/PRINCIPLES.md`](doc/PRINCIPLES.md) | 機能を考える・作る・見直すときの基準。UI を触る前に必ず読む |
| [`doc/RULES.md`](doc/RULES.md) | 挙動の決まり（正）。触る機能の節を読む。「言葉」の節は画面の文言の決まり |
| [`doc/UI_CONSISTENCY.md`](doc/UI_CONSISTENCY.md) | 共通の色・部品・挙動。新しく作る前にここにあるものを使う |
| [`doc/CURSOR_CONTEXT.md`](doc/CURSOR_CONTEXT.md) | ファイルの地図と、保存・同期・DB・運用 |
| [`doc/IDEAS.md`](doc/IDEAS.md) | まだ作業に分けていないアイデアと方向性 |
| [`doc/PUBLISHING.md`](doc/PUBLISHING.md) | 公開の手順・秘密と環境変数 |

## 作業の進め方

- **先に Issue**: 方針が決まったら、すぐ作る場合でも、着手する前に GitHub の Issue にする（本文に「完了条件」。ラベルは bug / enhancement / documentation / verify / security）。まだ形になっていない方向性は `doc/IDEAS.md`。Issue にしたら IDEAS からは消す
- **worktree で 1 機能 1 ブランチ**: `git worktree add .claude/worktrees/<名前> -b <種類>/<番号>-<名前> dev` → worktree の中で `ln -s <リポジトリ>/node_modules node_modules` → 作業・確かめる → コミット → リポジトリで `git merge --ff-only <ブランチ>` → `git worktree remove` と `git branch -d`。ほかの作業も同じ dev で動いているので、マージの前に dev の最新を取り込み、作業ツリーの未コミットの変更（ほかの作業のもの）には触らない
- **コミット**: `feat(範囲): 何をどうしたか（日本語）, fix #番号`。種類は feat / fix / refactor / chore / docs / test。1 つの機能を 1 つのコミットにまとめる
- **テスト**: 途中は `npx vitest related <変えたファイル> --run`。コミットの前に `npx vitest run --maxWorkers=50%` を 1 回と `npx eslint .`・`npx tsc --noEmit -p tsconfig.app.json`。時刻を扱うところを変えたら `npm run test:tz`（詳しくは RULES.md の「テスト」）
- **画面を見る**: UI を変えたら `npm run shots` で PC / スマホ × ライト / ダークを撮って自分で見てから終わりにする（`scripts/shots/README.md`）
- **ドキュメントも同じ作業で直す**: 挙動を変えたら `doc/RULES.md`、共通部品を足した・変えたら `doc/UI_CONSISTENCY.md`、ファイルの構成・DB・環境変数・scripts を変えたら `doc/CURSOR_CONTEXT.md`
- **doc に書くのは今の事実だけ**: 決まり・場所・関数名。「済」「〜日に決めた」「一度〜して戻した」のような経緯や日付は書かない
- **文言**: `src/locales/ja.ts` と `en.ts` の両方を直す。言葉は RULES.md の「言葉」に合わせる（締切・実行日・予定・記録・ラベル・タグ…）
- **DB と Edge Function**: migration は `supabase/migrations/` に番号順で足し、コミット済みのファイルは書き換えない。本番への出し方は RULES.md の「デプロイ」
