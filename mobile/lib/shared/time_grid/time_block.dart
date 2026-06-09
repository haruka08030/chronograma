import 'dart:math' as math;

import 'package:flutter/material.dart';

import 'time_grid_metrics.dart';

/// A positioned time block (scheduled task / time log / Google event).
class TimeBlockData {
  const TimeBlockData({
    required this.startMinutes,
    required this.endMinutes,
    required this.title,
    required this.bg,
    required this.border,
    required this.fg,
    this.subtitle,
    this.badge,
    this.dashed = false,
    this.strikeThrough = false,
    this.onTap,
    this.id,
    this.onMove,
    this.onResize,
  });

  final int startMinutes;
  final int endMinutes;
  final String title;
  final String? subtitle;
  final String? badge;
  final Color bg;
  final Color border;
  final Color fg;
  final bool dashed;
  final bool strikeThrough;
  final VoidCallback? onTap;

  /// Stable identity (task id). Required for drag/move/resize.
  final String? id;

  /// Called on drag-to-move with the new (snapped) start minutes; duration kept.
  final void Function(int newStartMinutes)? onMove;

  /// Called on resize with the new (snapped) end minutes.
  final void Function(int newEndMinutes)? onResize;

  bool get draggable => id != null && (onMove != null || onResize != null);

  double get top => minutesToY(startMinutes);
  double get height =>
      math.max(minutesToY(endMinutes) - minutesToY(startMinutes), kMinBlockHeight);
}

/// Visual block rendered inside a [TimeGrid] column stack.
class TimeBlock extends StatelessWidget {
  const TimeBlock({super.key, required this.data, this.compact = false});

  final TimeBlockData data;
  final bool compact;

  @override
  Widget build(BuildContext context) {
    final showSubtitle =
        !compact && data.height >= 34 && (data.subtitle?.isNotEmpty ?? false);
    return Material(
      color: Colors.transparent,
      child: InkWell(
        onTap: data.onTap,
        borderRadius: BorderRadius.circular(6),
        child: Container(
          decoration: BoxDecoration(
            color: data.bg,
            borderRadius: BorderRadius.circular(6),
            border: Border.all(
              color: data.border,
              width: 1,
              style: data.dashed ? BorderStyle.solid : BorderStyle.solid,
            ),
          ),
          padding: EdgeInsets.symmetric(
            horizontal: compact ? 3 : 6,
            vertical: compact ? 1 : 3,
          ),
          clipBehavior: Clip.hardEdge,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Expanded(
                    child: Text(
                      data.title,
                      maxLines: data.height >= 34 ? 2 : 1,
                      overflow: TextOverflow.ellipsis,
                      style: TextStyle(
                        fontSize: compact ? 9 : 11,
                        height: 1.15,
                        fontWeight: FontWeight.w600,
                        color: data.fg,
                        decoration: data.strikeThrough
                            ? TextDecoration.lineThrough
                            : null,
                      ),
                    ),
                  ),
                  if (data.badge != null && !compact && data.height >= 26)
                    Padding(
                      padding: const EdgeInsets.only(left: 2),
                      child: Text(
                        data.badge!,
                        style: TextStyle(
                          fontSize: 8,
                          color: data.fg.withValues(alpha: 0.7),
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                    ),
                ],
              ),
              if (showSubtitle)
                Text(
                  data.subtitle!,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(
                    fontSize: 9,
                    color: data.fg.withValues(alpha: 0.75),
                  ),
                ),
            ],
          ),
        ),
      ),
    );
  }
}
