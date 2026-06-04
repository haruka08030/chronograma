import 'task.dart';

/// Supabase `lists` 行のローカル表現（Web `TaskList` に相当）。
class TaskListMeta {
  const TaskListMeta({
    required this.id,
    required this.name,
    required this.color,
    required this.sortOrder,
  });

  final String id;
  final String name;
  final String color;
  final int sortOrder;

  TaskListMeta copyWith({
    String? id,
    String? name,
    String? color,
    int? sortOrder,
  }) {
    return TaskListMeta(
      id: id ?? this.id,
      name: name ?? this.name,
      color: color ?? this.color,
      sortOrder: sortOrder ?? this.sortOrder,
    );
  }

  Map<String, dynamic> toJson() => {
        'id': id,
        'name': name,
        'color': color,
        'sortOrder': sortOrder,
      };

  factory TaskListMeta.fromJson(Map<String, dynamic> json) {
    final id = json['id'] as String;
    var name = json['name'] as String? ?? '';
    if (id == Task.inboxListId && name == '受信トレイ') {
      name = '未分類';
    }
    return TaskListMeta(
      id: id,
      name: name,
      color: json['color'] as String? ?? '#6366f1',
      sortOrder: switch (json['sortOrder'] ?? json['sort_order'] ?? json['order']) {
        final int i => i,
        final String s => int.tryParse(s) ?? 0,
        final v => int.tryParse('$v') ?? 0,
      },
    );
  }
}
