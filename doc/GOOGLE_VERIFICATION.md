# Google OAuth 審査: スコープと理由

要求するスコープは 2 つ（`src/lib/googleCalendar.ts` と `supabase/functions/google-calendar/index.ts` の `SCOPES`）。
呼ぶ API は primary カレンダーだけ: 予定の取得・作成・更新・削除（`/calendars/primary/events`）と、カレンダーの色（`/users/me/calendarList/primary`）。
下の英文は OAuth 同意画面の「データアクセス」で各スコープの理由欄にそのまま貼る。

| スコープ | 呼ぶ API | 使う画面・操作 |
|----------|----------|----------------|
| `https://www.googleapis.com/auth/calendar.events.owned` | `events.list` / `events.insert` / `events.patch` / `events.delete`（`calendars/primary`） | カレンダー・今日のタイムラインに予定を出す／空いた時間をクリックして「Google カレンダー」に予定を作る／予定をドラッグで動かす・名前を変える・消す |
| `https://www.googleapis.com/auth/calendar.calendarlist.readonly` | `calendarList.get`（`users/me/calendarList/primary`） | 色の指定が無い予定を、Google カレンダーと同じカレンダーの色で出す |

## calendar.events.owned

**Why the app needs it**

Chronograma is a planner that puts the user's plans and what they actually did on one timeline. It reads the events on the user's primary Google Calendar and shows them on the Calendar and Today timelines next to their tasks and time records, so the user can compare what was planned with what happened. The user can also create an event by clicking an empty time slot and choosing "Google Calendar", move an event by dragging it, rename it, or delete it. Each of these writes only the event the user acted on, in their primary calendar.

**Where it is used**

Calendar view and Today view (showing events); the quick-create popover on an empty time slot (creating); dragging an event and the event popover (moving, renaming, deleting).

**Why a narrower scope is not enough**

The app has to write events, so the read-only scopes (`calendar.events.readonly`, `calendar.events.owned.readonly`) are not enough. `calendar.events.owned` is already limited to calendars the user owns, and the app only uses the primary calendar. `calendar.app.created` only covers secondary calendars made by the app, but the user's existing events are on their primary calendar.

## calendar.calendarlist.readonly

**Why the app needs it**

Events that have no color of their own are shown in Google Calendar with the color the user picked for the calendar. The app reads that one setting (the primary calendar's color in the user's calendar list) so the events look the same as in Google Calendar. It does not read or change any other calendars.

**Where it is used**

Calendar view and Today view, when drawing Google Calendar events.

**Why a narrower scope is not enough**

The calendar's color is stored only in the user's calendar list entry. The event scopes do not return it, and `calendarList.get` accepts no scope narrower than `calendar.calendarlist.readonly` (the others are `calendar.readonly`, `calendar.calendarlist`, `calendar` and `calendar.app.created`, which do not include the primary calendar).

## 前の版の接続

前の版は `calendar.readonly`・`calendar.events` を要求していた。その接続は保存したスコープに `calendar.events` があれば書き込める扱いのまま動く（`hasWriteScope`）。つなぎ直すと新しい 2 つのスコープになる。
