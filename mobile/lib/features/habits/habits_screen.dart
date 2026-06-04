import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../design/app_radius.dart';
import '../../design/app_spacing.dart';
import 'models/habit.dart';
import 'providers/habits_providers.dart';

final habitsSelectedDateProvider = StateProvider<DateTime>((ref) {
  final n = DateTime.now();
  return DateTime(n.year, n.month, n.day);
});

class HabitsScreen extends ConsumerWidget {
  const HabitsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final day = ref.watch(habitsSelectedDateProvider);
    final habits = ref.watch(habitsListProvider);
    final dateKey = habitDateKey(day);

    void shiftDay(int delta) {
      ref.read(habitsSelectedDateProvider.notifier).state = DateTime(day.year, day.month, day.day + delta);
    }

    return SafeArea(
      child: ListView(
        padding: const EdgeInsets.fromLTRB(AppSpacing.xl, AppSpacing.lg, AppSpacing.xl, 120),
        children: [
          Text('Habits', style: Theme.of(context).textTheme.displaySmall),
          const SizedBox(height: AppSpacing.md),
          Text(
            '独立した習慣モデル（ローカル永続化 + 同期対象）',
            style: Theme.of(context).textTheme.bodyMedium,
          ),
          const SizedBox(height: AppSpacing.md),
          Row(
            children: [
              IconButton(onPressed: () => shiftDay(-1), icon: const Icon(Icons.chevron_left)),
              Expanded(
                child: FilledButton.tonal(
                  onPressed: () async {
                    final picked = await showDatePicker(
                      context: context,
                      initialDate: day,
                      firstDate: DateTime(day.year - 2),
                      lastDate: DateTime(day.year + 3),
                    );
                    if (picked != null) {
                      ref.read(habitsSelectedDateProvider.notifier).state =
                          DateTime(picked.year, picked.month, picked.day);
                    }
                  },
                  child: Text(
                    '${day.year}-${day.month.toString().padLeft(2, '0')}-${day.day.toString().padLeft(2, '0')}',
                  ),
                ),
              ),
              IconButton(onPressed: () => shiftDay(1), icon: const Icon(Icons.chevron_right)),
            ],
          ),
          const SizedBox(height: AppSpacing.md),
          FilledButton.tonalIcon(
            onPressed: () async {
              final created = await _showCreateHabitDialog(context);
              if (created == null || created.trim().isEmpty) return;
              ref.read(habitsListProvider.notifier).addHabit(title: created.trim());
            },
            icon: const Icon(Icons.add),
            label: const Text('習慣を追加'),
          ),
          const SizedBox(height: AppSpacing.xl),
          if (habits.isEmpty)
            Container(
              padding: const EdgeInsets.all(AppSpacing.lg),
              decoration: BoxDecoration(
                color: Theme.of(context).colorScheme.surfaceContainerLowest,
                borderRadius: BorderRadius.circular(AppRadius.md),
              ),
              child: Text(
                '習慣がまだありません。\n「習慣を追加」から作成してください。',
                style: Theme.of(context).textTheme.bodyMedium,
              ),
            )
          else
            ...habits.map(
              (habit) {
                final done = habit.completedDates.contains(dateKey);
                return Card(
                  margin: const EdgeInsets.only(bottom: AppSpacing.md),
                  child: ListTile(
                    leading: Icon(
                      done ? Icons.check_circle : Icons.radio_button_unchecked,
                      color: done ? Theme.of(context).colorScheme.primary : null,
                    ),
                    title: Text(habit.title),
                    subtitle: Text(done ? '達成済み' : '未達成'),
                    trailing: Switch(
                      value: done,
                      onChanged: (_) =>
                          ref.read(habitsListProvider.notifier).toggleHabitDate(habit.id, day),
                    ),
                    onLongPress: () => _showEditHabitSheet(context, ref, habit),
                  ),
                );
              },
            ),
        ],
      ),
    );
  }
}

Future<String?> _showCreateHabitDialog(BuildContext context) async {
  final c = TextEditingController();
  final result = await showDialog<String>(
    context: context,
    builder: (ctx) => AlertDialog(
      title: const Text('習慣を追加'),
      content: TextField(
        controller: c,
        autofocus: true,
        decoration: const InputDecoration(labelText: 'タイトル'),
        textInputAction: TextInputAction.done,
        onSubmitted: (_) => Navigator.pop(ctx, c.text),
      ),
      actions: [
        TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('キャンセル')),
        FilledButton(onPressed: () => Navigator.pop(ctx, c.text), child: const Text('追加')),
      ],
    ),
  );
  c.dispose();
  return result;
}

Future<void> _showEditHabitSheet(BuildContext context, WidgetRef ref, Habit habit) async {
  final c = TextEditingController(text: habit.title);
  await showModalBottomSheet<void>(
    context: context,
    useSafeArea: true,
    builder: (ctx) => Padding(
      padding: const EdgeInsets.all(AppSpacing.xl),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text('習慣を編集', style: Theme.of(ctx).textTheme.titleLarge),
          const SizedBox(height: AppSpacing.md),
          TextField(
            controller: c,
            decoration: const InputDecoration(labelText: 'タイトル'),
          ),
          const SizedBox(height: AppSpacing.md),
          FilledButton(
            onPressed: () {
              ref.read(habitsListProvider.notifier).updateHabit(habit.copyWith(title: c.text.trim()));
              Navigator.pop(ctx);
            },
            child: const Text('保存'),
          ),
          const SizedBox(height: AppSpacing.sm),
          OutlinedButton(
            onPressed: () {
              ref.read(habitsListProvider.notifier).deleteHabit(habit.id);
              Navigator.pop(ctx);
            },
            child: const Text('削除'),
          ),
        ],
      ),
    ),
  );
  c.dispose();
}
