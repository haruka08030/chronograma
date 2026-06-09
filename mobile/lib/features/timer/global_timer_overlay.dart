import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../log/log_providers.dart';
import '../todo/providers/todo_providers.dart';
import '../../design/app_colors.dart';

/// Web グローバルタイマー相当。ログタブ外でも停止できる。
class GlobalTimerOverlay extends ConsumerWidget {
  const GlobalTimerOverlay({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final timer = ref.watch(activeLogTimerProvider);
    if (timer == null) return const SizedBox.shrink();

    return Positioned(
      left: 16,
      right: 16,
      bottom: 88,
      child: Material(
        elevation: 8,
        borderRadius: BorderRadius.circular(16),
        color: Theme.of(context).colorScheme.surface.withValues(alpha: 0.95),
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
          child: Row(
            children: [
              Icon(Icons.timer, color: AppColors.primary),
              const SizedBox(width: 12),
              Expanded(
                child: Text(
                  timer.title.isEmpty ? '記録中…' : timer.title,
                  style: Theme.of(context).textTheme.titleSmall,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                ),
              ),
              TextButton(
                onPressed: () {
                  final stopped =
                      ref.read(activeLogTimerProvider.notifier).stopAndBuildLog();
                  if (stopped != null) {
                    ref.read(todoListProvider.notifier).putTimeLog(stopped);
                  }
                },
                child: const Text('停止'),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
