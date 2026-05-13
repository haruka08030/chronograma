enum TaskPriority { none, low, medium, high }

extension TaskPriorityLabel on TaskPriority {
  String get label {
    switch (this) {
      case TaskPriority.none:
        return 'なし';
      case TaskPriority.low:
        return '低';
      case TaskPriority.medium:
        return '中';
      case TaskPriority.high:
        return '高';
    }
  }
}
