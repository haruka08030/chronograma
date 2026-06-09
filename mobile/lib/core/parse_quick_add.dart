/// Port of Web `src/lib/parseQuickAdd.ts`.
class ParsedQuickAdd {
  const ParsedQuickAdd({
    required this.title,
    this.dueDate,
    this.tags = const [],
  });

  final String title;
  final DateTime? dueDate;
  final List<String> tags;
}

ParsedQuickAdd parseQuickAddTitle(String raw, {required bool localeJa}) {
  final parts = raw.trim().split(RegExp(r'\s+')).where((p) => p.isNotEmpty).toList();
  if (parts.isEmpty) {
    return ParsedQuickAdd(title: raw.trim());
  }

  final tags = <String>[];
  DateTime? dueDate;
  final today = DateTime(DateTime.now().year, DateTime.now().month, DateTime.now().day);

  final dateKeywords = <String, DateTime>{
    'today': today,
    'tomorrow': today.add(const Duration(days: 1)),
  };
  if (localeJa) {
    dateKeywords['今日'] = today;
    dateKeywords['明日'] = today.add(const Duration(days: 1));
  }

  while (parts.isNotEmpty) {
    final last = parts.last;
    final low = last.toLowerCase();
    if (last.startsWith('#') && last.length > 1) {
      final name = last.substring(1).trim();
      if (name.isNotEmpty && !tags.contains(name)) {
        tags.insert(0, name);
      }
      parts.removeLast();
      continue;
    }
    if (dateKeywords.containsKey(last) || dateKeywords.containsKey(low)) {
      dueDate = dateKeywords[last] ?? dateKeywords[low];
      parts.removeLast();
      continue;
    }
    final iso = RegExp(r'^\d{4}-\d{2}-\d{2}$');
    if (iso.hasMatch(last)) {
      final parsed = DateTime.tryParse('${last}T12:00:00');
      if (parsed != null) {
        dueDate = DateTime(parsed.year, parsed.month, parsed.day);
        parts.removeLast();
        continue;
      }
    }
    break;
  }

  final title = parts.join(' ').trim().isEmpty ? raw.trim() : parts.join(' ').trim();
  return ParsedQuickAdd(title: title, dueDate: dueDate, tags: tags);
}
