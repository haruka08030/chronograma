import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter/services.dart';

import '../../app/theme_mode_provider.dart';
import '../../core/backup_format.dart';
import '../../core/csv_import.dart';
import '../../l10n/app_strings.dart';
import '../google/google_calendar_service.dart';
import '../google/google_connection_provider.dart';
import '../stats/stats_screen.dart';
import '../../design/design.dart';
import '../habits/models/habit.dart';
import '../habits/providers/habits_providers.dart';
import '../todo/data/list_color_palettes.dart';
import '../todo/models/list_section_meta.dart';
import '../todo/models/task.dart';
import '../todo/models/task_list_meta.dart';
import '../todo/providers/todo_providers.dart';
import 'notification_service.dart';
import 'more_providers.dart';
import '../sync/sync_notifier.dart';
import '../sync/sync_status.dart';

class MoreScreen extends ConsumerStatefulWidget {
  const MoreScreen({super.key});

  @override
  ConsumerState<MoreScreen> createState() => _MoreScreenState();
}

class _MoreScreenState extends ConsumerState<MoreScreen> {
  late final TextEditingController _emailController;
  late final TextEditingController _tagPresetsController;

  @override
  void initState() {
    super.initState();
    _emailController = TextEditingController();
    _tagPresetsController = TextEditingController(
      text: ref.read(timeLogTagPresetsProvider).join('\n'),
    );
  }

  @override
  void dispose() {
    _emailController.dispose();
    _tagPresetsController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final mode = ref.watch(themeModeProvider);
    final sync = ref.watch(syncNotifierProvider);
    final notificationsEnabled = ref.watch(notificationsEnabledProvider);
    final tasks = ref.watch(todoListProvider);
    final habits = ref.watch(habitsListProvider);
    final signedIn = (sync.userEmail ?? '').isNotEmpty;
    final googleConnected = ref.watch(googleConnectedProvider);
    final locale = ref.watch(appLocaleProvider);

    return SafeArea(
      child: ListView(
        padding: const EdgeInsets.fromLTRB(
          AppSpacing.xl,
          AppSpacing.lg,
          AppSpacing.xl,
          96,
        ),
        children: [
          Text(
            '外観',
            style: Theme.of(context).textTheme.titleMedium,
          ),
          const SizedBox(height: AppSpacing.sm),
          SegmentedButton<ThemeMode>(
            segments: const [
              ButtonSegment(
                value: ThemeMode.system,
                label: Text('システム'),
              ),
              ButtonSegment(
                value: ThemeMode.light,
                label: Text('ライト'),
              ),
              ButtonSegment(
                value: ThemeMode.dark,
                label: Text('ダーク'),
              ),
            ],
            selected: {mode},
            onSelectionChanged: (s) {
              ref.read(themeModeProvider.notifier).state = s.first;
            },
          ),
          const SizedBox(height: AppSpacing.md),
          SegmentedButton<AppLocale>(
            segments: const [
              ButtonSegment(value: AppLocale.ja, label: Text('日本語')),
              ButtonSegment(value: AppLocale.en, label: Text('English')),
            ],
            selected: {locale},
            onSelectionChanged: (s) {
              ref.read(appLocaleProvider.notifier).state = s.first;
            },
          ),
          const SizedBox(height: AppSpacing.xxl),
          Text(
            'カスタマイズ',
            style: Theme.of(context).textTheme.titleMedium,
          ),
          const SizedBox(height: AppSpacing.sm),
          Text(
            'リスト色パレット',
            style: Theme.of(context).textTheme.labelLarge,
          ),
          const SizedBox(height: AppSpacing.sm),
          _PalettePicker(),
          const SizedBox(height: AppSpacing.md),
          Text(
            '活動ログのタグ候補（1行に1つ）',
            style: Theme.of(context).textTheme.labelLarge,
          ),
          const SizedBox(height: AppSpacing.sm),
          TextField(
            controller: _tagPresetsController,
            minLines: 3,
            maxLines: 8,
            decoration: const InputDecoration(
              border: OutlineInputBorder(),
              hintText: '仕事\n勉強\n運動',
            ),
            onEditingComplete: () {
              ref
                  .read(timeLogTagPresetsProvider.notifier)
                  .setFromText(_tagPresetsController.text);
              FocusScope.of(context).unfocus();
            },
          ),
          const SizedBox(height: AppSpacing.xs),
          Align(
            alignment: Alignment.centerRight,
            child: TextButton.icon(
              onPressed: () {
                ref
                    .read(timeLogTagPresetsProvider.notifier)
                    .setFromText(_tagPresetsController.text);
                FocusScope.of(context).unfocus();
                ScaffoldMessenger.of(context).showSnackBar(
                  const SnackBar(content: Text('タグ候補を保存しました')),
                );
              },
              icon: const Icon(Icons.save_outlined, size: 18),
              label: const Text('タグ候補を保存'),
            ),
          ),
          const SizedBox(height: AppSpacing.xxl),
          Text(
            'Google Calendar',
            style: Theme.of(context).textTheme.titleMedium,
          ),
          const SizedBox(height: AppSpacing.sm),
          if (googleConnected)
            ListTile(
              contentPadding: EdgeInsets.zero,
              leading: const Icon(Icons.event_available, color: Colors.green),
              title: const Text('Google Calendar 接続中'),
              trailing: TextButton(
                onPressed: () async {
                  final svc = GoogleCalendarService.tryCreate();
                  if (svc != null) await svc.disconnect();
                  await ref.read(googleConnectedProvider.notifier).setConnected(false);
                },
                child: const Text('切断'),
              ),
            )
          else
            FilledButton.tonalIcon(
              onPressed: signedIn
                  ? () async {
                      await ref.read(syncNotifierProvider.notifier).signInWithGoogle();
                      await ref.read(googleConnectedProvider.notifier).setConnected(true);
                    }
                  : null,
              icon: const Icon(Icons.calendar_month),
              label: const Text('Google Calendar に接続'),
            ),
          const SizedBox(height: AppSpacing.xxl),
          Text(
            '同期（Supabase）',
            style: Theme.of(context).textTheme.titleMedium,
          ),
          const SizedBox(height: AppSpacing.sm),
          if (signedIn)
            ListTile(
              contentPadding: EdgeInsets.zero,
              leading: const Icon(Icons.person_outline),
              title: const Text('ログイン中'),
              subtitle: Text(sync.userEmail!),
              trailing: TextButton(
                onPressed: () => ref.read(syncNotifierProvider.notifier).signOut(),
                child: const Text('ログアウト'),
              ),
            )
          else
            Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                FilledButton.icon(
                  onPressed: () async {
                    final error = await ref
                        .read(syncNotifierProvider.notifier)
                        .signInWithGoogle();
                    if (!context.mounted) return;
                    ScaffoldMessenger.of(context).showSnackBar(
                      SnackBar(
                        content: Text(
                          error ?? 'Google ログイン画面を開きました。',
                        ),
                      ),
                    );
                  },
                  icon: const Icon(Icons.login),
                  label: const Text('Google でログイン'),
                ),
                const SizedBox(height: AppSpacing.md),
                Text(
                  'またはメールリンクでログイン',
                  style: Theme.of(context).textTheme.bodySmall,
                ),
                const SizedBox(height: AppSpacing.sm),
                TextField(
                  controller: _emailController,
                  keyboardType: TextInputType.emailAddress,
                  decoration: const InputDecoration(
                    labelText: 'メールアドレス',
                    hintText: 'you@example.com',
                  ),
                ),
                const SizedBox(height: AppSpacing.sm),
                FilledButton.tonalIcon(
                  onPressed: () async {
                    final error = await ref
                        .read(syncNotifierProvider.notifier)
                        .signInWithOtp(_emailController.text);
                    if (!context.mounted) return;
                    ScaffoldMessenger.of(context).showSnackBar(
                      SnackBar(
                        content: Text(
                          error ?? 'ログインリンクを送信しました。メールを確認してください。',
                        ),
                      ),
                    );
                  },
                  icon: const Icon(Icons.mail_outline),
                  label: const Text('ログインリンク送信'),
                ),
              ],
            ),
          ListTile(
            contentPadding: EdgeInsets.zero,
            title: Text(_syncLabel(sync)),
            subtitle: sync.lastError != null
                ? Text(
                    sync.lastError!,
                    style: TextStyle(color: Theme.of(context).colorScheme.error),
                  )
                : null,
          ),
          const SizedBox(height: AppSpacing.md),
          OutlinedButton.icon(
            onPressed: sync.status == SyncStatus.syncing || !signedIn
                ? null
                : () => ref.read(syncNotifierProvider.notifier).pullSync(),
            icon: const Icon(Icons.sync),
            label: const Text('今すぐ同期'),
          ),
          const SizedBox(height: AppSpacing.xxl),
          Text(
            'データ',
            style: Theme.of(context).textTheme.titleMedium,
          ),
          const SizedBox(height: AppSpacing.sm),
          FilledButton.tonalIcon(
            onPressed: _showExportDialog,
            icon: const Icon(Icons.upload_file),
            label: const Text('JSON エクスポート'),
          ),
          const SizedBox(height: AppSpacing.sm),
          OutlinedButton.icon(
            onPressed: _showImportDialog,
            icon: const Icon(Icons.download_for_offline_outlined),
            label: const Text('JSON インポート'),
          ),
          const SizedBox(height: AppSpacing.sm),
          OutlinedButton.icon(
            onPressed: _showCsvImportDialog,
            icon: const Icon(Icons.table_rows_outlined),
            label: const Text('CSV からタスク追加'),
          ),
          const SizedBox(height: AppSpacing.xxl),
          Text(
            '通知',
            style: Theme.of(context).textTheme.titleMedium,
          ),
          const SizedBox(height: AppSpacing.sm),
          SwitchListTile(
            contentPadding: EdgeInsets.zero,
            title: const Text('通知を有効化'),
            subtitle: const Text('権限を要求し、テスト通知を利用可能にします'),
            value: notificationsEnabled,
            onChanged: (v) async {
              if (v) {
                final granted = await NotificationService.instance.requestPermissionsIfNeeded();
                if (!mounted) return;
                if (!granted) {
                  ScaffoldMessenger.of(this.context).showSnackBar(
                    const SnackBar(content: Text('通知権限が許可されていません')),
                  );
                }
              }
              ref.read(notificationsEnabledProvider.notifier).setEnabled(v);
              if (v) {
                await _rescheduleNotifications(ref);
              }
            },
          ),
          const SizedBox(height: AppSpacing.sm),
          OutlinedButton.icon(
            onPressed: notificationsEnabled
                ? () async {
                    await NotificationService.instance.showBasic(
                      id: DateTime.now().millisecondsSinceEpoch ~/ 1000,
                      title: 'Chronograma',
                      body: '通知テストです。設定は有効です。',
                    );
                  }
                : null,
            icon: const Icon(Icons.notifications_active_outlined),
            label: const Text('テスト通知を送信'),
          ),
          const SizedBox(height: AppSpacing.xxl),
          Text(
            '統計',
            style: Theme.of(context).textTheme.titleMedium,
          ),
          const SizedBox(height: AppSpacing.sm),
          OutlinedButton.icon(
            onPressed: () {
              Navigator.of(context).push(
                MaterialPageRoute<void>(builder: (_) => const StatsScreen()),
              );
            },
            icon: const Icon(Icons.bar_chart),
            label: const Text('統計を開く'),
          ),
          const SizedBox(height: AppSpacing.sm),
          _StatsSection(tasks: tasks, habits: habits),
        ],
      ),
    );
  }

  String _syncLabel(SyncState s) {
    switch (s.status) {
      case SyncStatus.idle:
        return '状態: 待機';
      case SyncStatus.syncing:
        return '状態: 同期中';
      case SyncStatus.synced:
        return '状態: 同期済み';
      case SyncStatus.offline:
        return '状態: オフライン';
      case SyncStatus.failed:
        return '状態: 失敗';
    }
  }

  Map<String, dynamic> _buildExportMap() {
    final tasks = ref.read(todoListProvider);
    final habits = ref.read(habitsListProvider);
    final lists = ref.read(taskListsProvider);
    final sections = ref.read(listSectionsProvider);
    return buildBackupExportMap(
      tasks: tasks.map((t) => t.toJson()).toList(),
      habits: habits.map((h) => h.toJson()).toList(),
      lists: lists.map((l) => l.toJson()).toList(),
      listSections: sections.map((s) => s.toJson()).toList(),
    );
  }

  void _showExportDialog() {
    final jsonText = const JsonEncoder.withIndent('  ').convert(_buildExportMap());
    showDialog<void>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('JSON エクスポート'),
        content: SizedBox(
          width: 560,
          child: SelectableText(
            jsonText,
            style: Theme.of(ctx).textTheme.bodySmall?.copyWith(fontFamily: 'monospace'),
          ),
        ),
        actions: [
          TextButton(
            onPressed: () async {
              await Clipboard.setData(ClipboardData(text: jsonText));
              if (!ctx.mounted) return;
              ScaffoldMessenger.of(ctx).showSnackBar(
                const SnackBar(content: Text('クリップボードにコピーしました')),
              );
            },
            child: const Text('コピー'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(ctx),
            child: const Text('閉じる'),
          ),
        ],
      ),
    );
  }

  void _showImportDialog() {
    final controller = TextEditingController();
    showDialog<void>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('JSON インポート'),
        content: SizedBox(
          width: 560,
          child: TextField(
            controller: controller,
            maxLines: 16,
            decoration: const InputDecoration(
              hintText: 'ここに JSON を貼り付け',
              border: OutlineInputBorder(),
            ),
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx),
            child: const Text('キャンセル'),
          ),
          FilledButton(
            onPressed: () {
              final ok = _importFromJson(controller.text);
              if (!ctx.mounted) return;
              Navigator.pop(ctx);
              ScaffoldMessenger.of(context).showSnackBar(
                SnackBar(
                  content: Text(ok ? 'インポートしました' : 'JSON の形式が不正です'),
                ),
              );
            },
            child: const Text('インポート'),
          ),
        ],
      ),
    );
  }

  bool _importFromJson(String raw) {
    try {
      final decoded = jsonDecode(raw);
      if (decoded is! Map<String, dynamic>) return false;
      final tasksRaw = decoded['tasks'];
      if (tasksRaw is! List) return false;
      final tasks = tasksRaw
          .map((e) => Task.fromJson(Map<String, dynamic>.from(e as Map)))
          .toList();
      ref.read(todoListProvider.notifier).replaceAll(tasks);

      final habitsRaw = decoded['habits'];
      final habits = habitsRaw is List
          ? habitsRaw
              .map((e) => Habit.fromJson(Map<String, dynamic>.from(e as Map)))
              .toList()
          : <Habit>[];
      ref.read(habitsListProvider.notifier).replaceAll(habits);

      final listsRaw = decoded['lists'];
      if (listsRaw is List) {
        final lists = listsRaw
            .map((e) => TaskListMeta.fromJson(Map<String, dynamic>.from(e as Map)))
            .toList();
        ref.read(taskListsProvider.notifier).replaceAll(lists);
      }

      final sectionsRaw = readSectionsArray(decoded);
      if (sectionsRaw.isNotEmpty) {
        final sections = sectionsRaw
            .map((e) => ListSectionMeta.fromJson(Map<String, dynamic>.from(e as Map)))
            .toList();
        ref.read(listSectionsProvider.notifier).replaceAll(sections);
      }
      return true;
    } catch (_) {
      return false;
    }
  }

  Future<void> _rescheduleNotifications(WidgetRef ref) async {
    final tasks = ref.read(todoListProvider);
    await NotificationService.instance.rescheduleDueReminders(
      tasks: [
        for (final t in tasks.where((t) => !t.isTimeLog))
          (id: t.id, title: t.title, dueDate: t.dueDate, completed: t.completed),
      ],
    );
  }

  void _showCsvImportDialog() {
    final controller = TextEditingController();
    showDialog<void>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('CSV からタスク追加'),
        content: SizedBox(
          width: 560,
          child: TextField(
            controller: controller,
            maxLines: 12,
            decoration: const InputDecoration(
              hintText: 'title,due date 形式の CSV',
              border: OutlineInputBorder(),
            ),
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx),
            child: const Text('キャンセル'),
          ),
          FilledButton(
            onPressed: () {
              final result = importTasksFromCsv(
                controller.text,
                defaultListId: Task.inboxListId,
              );
              if (result.tasks.isNotEmpty) {
                final existing = ref.read(todoListProvider);
                ref.read(todoListProvider.notifier).replaceAll([
                  ...existing,
                  ...result.tasks,
                ]);
              }
              if (!ctx.mounted) return;
              Navigator.pop(ctx);
              ScaffoldMessenger.of(context).showSnackBar(
                SnackBar(
                  content: Text(
                    '追加 ${result.imported} / スキップ ${result.skipped}',
                  ),
                ),
              );
            },
            child: const Text('インポート'),
          ),
        ],
      ),
    );
  }
}

class _PalettePicker extends ConsumerWidget {
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final selected = ref.watch(listColorPaletteProvider);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        for (final p in listColorPalettes)
          InkWell(
            borderRadius: BorderRadius.circular(AppRadius.md),
            onTap: () => ref.read(listColorPaletteProvider.notifier).set(p.id),
            child: Padding(
              padding: const EdgeInsets.symmetric(vertical: 6, horizontal: 4),
              child: Row(
                children: [
                  Icon(
                    p.id == selected
                        ? Icons.radio_button_checked
                        : Icons.radio_button_unchecked,
                    size: 18,
                    color: p.id == selected
                        ? Theme.of(context).colorScheme.primary
                        : Theme.of(context).colorScheme.outline,
                  ),
                  const SizedBox(width: AppSpacing.sm),
                  Expanded(
                    child: Row(
                      children: [
                        for (final c in p.colors.take(8))
                          Container(
                            width: 16,
                            height: 16,
                            margin: const EdgeInsets.only(right: 3),
                            decoration: BoxDecoration(
                              color: hexToColor(c),
                              shape: BoxShape.circle,
                            ),
                          ),
                      ],
                    ),
                  ),
                ],
              ),
            ),
          ),
      ],
    );
  }
}

class _StatsSection extends StatelessWidget {
  const _StatsSection({
    required this.tasks,
    required this.habits,
  });

  final List<Task> tasks;
  final List<Habit> habits;

  @override
  Widget build(BuildContext context) {
    final todo = tasks.where((t) => !t.isTimeLog).toList();
    final logs = tasks.where((t) => t.isTimeLog).toList();
    final done = todo.where((t) => t.completed).length;
    final open = todo.length - done;
    final today = DateTime.now();
    final weekStart = today.subtract(Duration(days: today.weekday - 1));
    final weekLogs = logs.where((t) {
      if (t.dueDate == null) return false;
      final d = DateTime(t.dueDate!.year, t.dueDate!.month, t.dueDate!.day);
      return !d.isBefore(weekStart);
    }).length;
    final habitsTodayDone = habits.where((h) => h.completedDates.contains(habitDateKey(today))).length;

    Widget card(String label, String value) {
      return Expanded(
        child: Card(
          child: Padding(
            padding: const EdgeInsets.all(AppSpacing.md),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(label, style: Theme.of(context).textTheme.labelMedium),
                const SizedBox(height: AppSpacing.xs),
                Text(value, style: Theme.of(context).textTheme.titleLarge),
              ],
            ),
          ),
        ),
      );
    }

    return Column(
      children: [
        Row(
          children: [
            card('未完了 To-Do', '$open'),
            card('完了 To-Do', '$done'),
          ],
        ),
        Row(
          children: [
            card('今週のログ件数', '$weekLogs'),
            card('今日の習慣達成', '$habitsTodayDone/${habits.length}'),
          ],
        ),
      ],
    );
  }
}
