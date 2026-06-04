/// Web `HabitTimeMode` / Supabase `habits.time_mode` に対応。
enum HabitTimeMode { none, fixed, range }

class Habit {
  const Habit({
    required this.id,
    required this.title,
    this.color = '#f97316',
    this.completedDates = const [],
    this.startTime,
    this.endTime,
    this.timeMode = HabitTimeMode.none,
    this.frequency = const {'type': 'daily'},
    required this.createdAt,
    required this.updatedAt,
  });

  final String id;
  final String title;
  final String color;
  /// `yyyy-MM-dd`
  final List<String> completedDates;
  final String? startTime;
  final String? endTime;
  final HabitTimeMode timeMode;
  /// Web と同形: `{type: daily}` または `{type: weekly, weekdays: [1,…,7]}`（ISO 曜日 1=月）
  final Map<String, dynamic> frequency;
  final String createdAt;
  final String updatedAt;

  Habit copyWith({
    String? id,
    String? title,
    String? color,
    List<String>? completedDates,
    String? startTime,
    String? endTime,
    HabitTimeMode? timeMode,
    Map<String, dynamic>? frequency,
    String? createdAt,
    String? updatedAt,
    bool clearStartTime = false,
    bool clearEndTime = false,
  }) {
    return Habit(
      id: id ?? this.id,
      title: title ?? this.title,
      color: color ?? this.color,
      completedDates: completedDates ?? this.completedDates,
      startTime: clearStartTime ? null : (startTime ?? this.startTime),
      endTime: clearEndTime ? null : (endTime ?? this.endTime),
      timeMode: timeMode ?? this.timeMode,
      frequency: frequency ?? this.frequency,
      createdAt: createdAt ?? this.createdAt,
      updatedAt: updatedAt ?? this.updatedAt,
    );
  }

  Map<String, dynamic> toJson() => {
        'id': id,
        'title': title,
        'color': color,
        'completedDates': completedDates,
        'startTime': startTime,
        'endTime': endTime,
        'timeMode': timeMode.name,
        'frequency': frequency,
        'createdAt': createdAt,
        'updatedAt': updatedAt,
      };

  static HabitTimeMode _inferTimeMode(String? start, String? end) {
    final hasStart = start != null && start.trim().isNotEmpty;
    final hasEnd = end != null && end.trim().isNotEmpty;
    if (hasStart && hasEnd) return HabitTimeMode.range;
    if (hasStart) return HabitTimeMode.fixed;
    return HabitTimeMode.none;
  }

  static HabitTimeMode _parseTimeMode(String? raw, String? startTime, String? endTime) {
    switch (raw) {
      case 'none':
        return HabitTimeMode.none;
      case 'fixed':
        return HabitTimeMode.fixed;
      case 'range':
        return HabitTimeMode.range;
      default:
        return _inferTimeMode(startTime, endTime);
    }
  }

  static Map<String, dynamic> _frequencyFromJson(dynamic raw) {
    if (raw is Map) {
      final m = Map<String, dynamic>.from(raw);
      if (m['type'] == 'weekly' && m['weekdays'] is List) {
        return m;
      }
      if (m['type'] == 'daily') return const {'type': 'daily'};
    }
    return const {'type': 'daily'};
  }

  factory Habit.fromJson(Map<String, dynamic> json) {
    final start = json['startTime'] as String? ?? json['start_time'] as String?;
    final end = json['endTime'] as String? ?? json['end_time'] as String?;
    final modeRaw = json['timeMode'] as String? ?? json['time_mode'] as String?;
    final now = DateTime.now().toUtc().toIso8601String();
    return Habit(
      id: json['id'] as String,
      title: (json['title'] as String?) ?? '',
      color: (json['color'] as String?) ?? '#f97316',
      completedDates: (json['completedDates'] as List<dynamic>? ??
              json['completed_dates'] as List<dynamic>?)
              ?.map((e) => e.toString())
              .toList() ??
          const [],
      startTime: start,
      endTime: end,
      timeMode: _parseTimeMode(modeRaw, start, end),
      frequency: _frequencyFromJson(json['frequency']),
      createdAt: json['createdAt'] as String? ?? json['created_at'] as String? ?? now,
      updatedAt: json['updatedAt'] as String? ?? json['updated_at'] as String? ?? now,
    );
  }
}

String habitDateKey(DateTime d) {
  final month = d.month.toString().padLeft(2, '0');
  final day = d.day.toString().padLeft(2, '0');
  return '${d.year}-$month-$day';
}
