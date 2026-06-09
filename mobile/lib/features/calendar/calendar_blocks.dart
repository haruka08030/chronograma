import 'package:flutter/material.dart';

import '../../design/app_colors.dart';
import '../../shared/time_grid/time_grid.dart';
import '../google/google_calendar_service.dart';
import '../log/log_tag_colors.dart';
import '../todo/models/task.dart';

const Color _googleBlue = Color(0xFF3B82F6);

/// Scheduled task -> time block (accent tone). Returns null if no start time.
TimeBlockData? scheduledTaskBlock(
  Task t, {
  required Brightness brightness,
  VoidCallback? onTap,
  void Function(int newStartMinutes)? onMove,
  void Function(int newEndMinutes)? onResize,
}) {
  final start = parseHhmmToMinutes(t.startTime);
  if (start == null) return null;
  final end = parseHhmmToMinutes(t.endTime) ?? (start + 60);
  final dark = brightness == Brightness.dark;
  if (t.completed) {
    return TimeBlockData(
      id: t.id,
      startMinutes: start,
      endMinutes: end,
      title: t.title,
      subtitle: '${t.startTime} - ${t.endTime ?? ''}',
      bg: (dark ? AppColors.zinc700 : AppColors.zinc100)
          .withValues(alpha: dark ? 0.5 : 1),
      border: dark ? AppColors.zinc600 : AppColors.zinc200,
      fg: AppColors.zinc400,
      strikeThrough: true,
      onTap: onTap,
    );
  }
  return TimeBlockData(
    id: t.id,
    startMinutes: start,
    endMinutes: end,
    title: t.title,
    subtitle: '${t.startTime} - ${t.endTime ?? ''}',
    bg: AppColors.accent500.withValues(alpha: dark ? 0.20 : 0.12),
    border: AppColors.accent500.withValues(alpha: 0.45),
    fg: dark ? AppColors.accent200 : AppColors.accent700,
    onTap: onTap,
    onMove: onMove,
    onResize: onResize,
  );
}

/// Google timed event -> time block (blue tone). Null for all-day / no start.
TimeBlockData? googleEventBlock(
  CalendarEventDto e, {
  required Brightness brightness,
  VoidCallback? onTap,
}) {
  if (e.isAllDay) return null;
  final start = parseHhmmToMinutes(e.startTime);
  if (start == null) return null;
  final end = parseHhmmToMinutes(e.endTime) ?? (start + 60);
  final dark = brightness == Brightness.dark;
  return TimeBlockData(
    startMinutes: start,
    endMinutes: end,
    title: e.summary,
    subtitle: e.startTime,
    badge: '外部',
    bg: _googleBlue.withValues(alpha: 0.14),
    border: _googleBlue.withValues(alpha: 0.45),
    fg: dark ? const Color(0xFF93C5FD) : const Color(0xFF1D4ED8),
    onTap: onTap,
  );
}

/// Time log -> time block (tag/emerald tone), clamped to the given day.
TimeBlockData? logBlock(
  Task t,
  DateTime day, {
  required Brightness brightness,
  VoidCallback? onTap,
  void Function(int newStartMinutes)? onMove,
  void Function(int newEndMinutes)? onResize,
}) {
  if (!t.isTimeLog) return null;
  final rawStart = parseHhmmToMinutes(t.startTime);
  final rawEnd = parseHhmmToMinutes(t.endTime);
  if (rawStart == null || rawEnd == null) return null;
  final startsToday = sameCalendarDay(t.dueDate, day);
  final endsToday = sameCalendarDay(t.endDate ?? t.dueDate, day);
  final start = startsToday ? rawStart : 0;
  final end = endsToday ? rawEnd : 24 * 60;
  if (end <= start) return null;
  // 複数日にまたがるログは編集が複雑なため、単日のときのみ移動/リサイズを許可。
  final singleDay = startsToday && endsToday;
  final color = logAccentColorForTags(t.tags, brightness);
  final dark = brightness == Brightness.dark;
  return TimeBlockData(
    id: t.id,
    startMinutes: start,
    endMinutes: end,
    title: t.title,
    subtitle: '${t.startTime} - ${t.endTime}',
    badge: 'ログ',
    bg: color.withValues(alpha: dark ? 0.24 : 0.14),
    border: color,
    fg: dark ? AppColors.zinc100 : AppColors.zinc900,
    onTap: onTap,
    onMove: singleDay ? onMove : null,
    onResize: singleDay ? onResize : null,
  );
}
