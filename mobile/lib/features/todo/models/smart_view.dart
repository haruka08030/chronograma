enum SmartView {
  all,
  today,
  upcoming,
  overdue,
}

extension SmartViewLabel on SmartView {
  String get label {
    switch (this) {
      case SmartView.all:
        return 'すべて';
      case SmartView.today:
        return '今日';
      case SmartView.upcoming:
        return '近日中';
      case SmartView.overdue:
        return '期限切れ';
    }
  }
}
