import 'package:flutter_riverpod/flutter_riverpod.dart';

enum AppLocale { ja, en }

final appLocaleProvider = StateProvider<AppLocale>((ref) => AppLocale.ja);

class S {
  S(this.locale);

  final AppLocale locale;
  bool get isJa => locale == AppLocale.ja;

  String get brand => 'Chronograma';
  String get appTitle => 'Chronograma';
  String get todo => 'To‑Do';
  String get calendar => isJa ? 'カレンダー' : 'Calendar';
  String get habits => isJa ? '習慣' : 'Habits';
  String get log => isJa ? 'ログ' : 'Log';
  String get more => isJa ? 'その他' : 'More';
  String get planVsActual => isJa ? '予定 vs 実績' : 'Plan vs Actual';
  String get stats => isJa ? '統計' : 'Stats';
  String get search => isJa ? '検索' : 'Search';
  String get searchPlaceholder => isJa ? 'タスクを検索…' : 'Search tasks…';
  String get addTask => isJa ? 'タスクを追加' : 'Add task';
  String get connectGoogle => isJa ? 'Google Calendar に接続' : 'Connect Google Calendar';
  String get googleConnected => isJa ? 'Google Calendar 接続中' : 'Google Calendar connected';
  String get disconnect => isJa ? '切断' : 'Disconnect';
  String get syncNow => isJa ? '今すぐ同期' : 'Sync now';
  String get lists => isJa ? 'リスト' : 'Lists';
  String get sections => isJa ? 'セクション' : 'Sections';
  String get importCsv => isJa ? 'CSV からタスク追加' : 'Import tasks from CSV';

  // Calendar
  String get month => isJa ? '月' : 'Month';
  String get week => isJa ? '週' : 'Week';
  String get day => isJa ? '日' : 'Day';
  String get plan => isJa ? '予定' : 'Plan';
  String get today => isJa ? '今日' : 'Today';
  String get allDay => isJa ? '終日' : 'All day';
  String get noEvents => isJa ? 'この日の予定・ログはありません' : 'Nothing scheduled or logged';
  String get addLog => isJa ? 'ログを追加' : 'Add log';
  String get now => isJa ? '現在' : 'Now';

  // Common
  String get all => isJa ? 'すべて' : 'All';
  String get addList => isJa ? 'リストを追加' : 'Add list';
  String get addSection => isJa ? 'セクションを追加' : 'Add section';
  String get manageLists => isJa ? 'リスト管理' : 'Manage lists';
  String get cancel => isJa ? 'キャンセル' : 'Cancel';
  String get ok => 'OK';
  String get noTasks => isJa ? '該当するタスクがありません' : 'No matching tasks';
  String get emptyHint => isJa ? 'クイック追加から最初のタスクを作りましょう' : 'Create your first task from quick add';
}

String tr(WidgetRef ref, String Function(S s) pick) {
  final locale = ref.watch(appLocaleProvider);
  return pick(S(locale));
}
