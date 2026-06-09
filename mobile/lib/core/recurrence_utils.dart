/// Next due date after completing a recurring task (Web `nextDueDate`).
String? nextDueDateYmd(String currentYmd, Map<String, dynamic> recurrence) {
  final type = recurrence['type'] as String?;
  final interval = (recurrence['interval'] as num?)?.toInt() ?? 1;
  final parts = currentYmd.split('-');
  if (parts.length != 3) return null;
  var y = int.parse(parts[0]);
  var m = int.parse(parts[1]);
  var d = int.parse(parts[2]);
  var date = DateTime(y, m, d);

  switch (type) {
    case 'daily':
      date = date.add(Duration(days: interval));
    case 'weekly':
      date = date.add(Duration(days: 7 * interval));
    case 'monthly':
      m += interval;
      while (m > 12) {
        m -= 12;
        y += 1;
      }
      date = DateTime(y, m, d);
    case 'yearly':
      date = DateTime(y + interval, m, d);
    default:
      return null;
  }
  return '${date.year.toString().padLeft(4, '0')}-'
      '${date.month.toString().padLeft(2, '0')}-'
      '${date.day.toString().padLeft(2, '0')}';
}

String taskDueDateYmd(DateTime? due) {
  if (due == null) return '';
  return '${due.year.toString().padLeft(4, '0')}-'
      '${due.month.toString().padLeft(2, '0')}-'
      '${due.day.toString().padLeft(2, '0')}';
}

DateTime? parseDueYmd(String ymd) {
  final p = DateTime.tryParse('${ymd}T12:00:00');
  if (p == null) return null;
  return DateTime(p.year, p.month, p.day);
}
