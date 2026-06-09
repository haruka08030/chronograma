import 'package:flutter/material.dart';

import '../../design/app_colors.dart';
import '../../design/app_radius.dart';
import '../../design/app_spacing.dart';
import '../../features/todo/models/task.dart';

/// To‑Do 行をカレンダーの時間グリッドへドラッグするためのラッパー（`rootOverlay` でタブ跨ぎ可）。
class ScheduleTaskDraggable extends StatelessWidget {
  const ScheduleTaskDraggable({
    super.key,
    required this.task,
    required this.enabled,
    required this.child,
  });

  final Task task;
  final bool enabled;
  final Widget child;

  @override
  Widget build(BuildContext context) {
    if (!enabled) return child;

    return LongPressDraggable<String>(
      data: task.id,
      rootOverlay: true,
      delay: const Duration(milliseconds: 200),
      hapticFeedbackOnStart: true,
      feedback: Material(
        elevation: 6,
        borderRadius: BorderRadius.circular(AppRadius.md),
        color: AppColors.accent500.withValues(alpha: 0.95),
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 220),
          child: Padding(
            padding: const EdgeInsets.symmetric(
              horizontal: AppSpacing.md,
              vertical: AppSpacing.sm,
            ),
            child: Text(
              task.title.isEmpty ? '(無題)' : task.title,
              maxLines: 2,
              overflow: TextOverflow.ellipsis,
              style: const TextStyle(
                color: Colors.white,
                fontWeight: FontWeight.w600,
                fontSize: 13,
              ),
            ),
          ),
        ),
      ),
      childWhenDragging: Opacity(opacity: 0.35, child: child),
      child: child,
    );
  }
}
