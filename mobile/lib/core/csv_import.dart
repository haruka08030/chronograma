import 'package:csv/csv.dart';
import 'package:uuid/uuid.dart';

import '../features/todo/models/task.dart';
class CsvImportResult {
  const CsvImportResult({
    required this.imported,
    required this.skipped,
    required this.errors,
    required this.tasks,
  });

  final int imported;
  final int skipped;
  final List<String> errors;
  final List<Task> tasks;
}

/// Merge-import tasks from CSV (Web `importTasksFromCsv` simplified).
CsvImportResult importTasksFromCsv(String csvText, {required String defaultListId}) {
  const uuid = Uuid();
  final errors = <String>[];
  final tasks = <Task>[];
  var imported = 0;
  var skipped = 0;

  List<List<dynamic>> rows;
  try {
    rows = const CsvToListConverter().convert(csvText);
  } catch (e) {
    return CsvImportResult(
      imported: 0,
      skipped: 0,
      errors: ['CSV parse error: $e'],
      tasks: [],
    );
  }
  if (rows.isEmpty) {
    return CsvImportResult(imported: 0, skipped: 0, errors: ['Empty CSV'], tasks: []);
  }

  final header = rows.first.map((c) => c.toString().trim().toLowerCase()).toList();
  final titleIdx = header.indexOf('title');
  final contentIdx = header.indexOf('content');
  final nameIdx = header.indexOf('name');
  final dueIdx = header.indexOf('due date');
  final dueAlt = header.indexOf('duedate');

  int colTitle() {
    if (titleIdx >= 0) return titleIdx;
    if (contentIdx >= 0) return contentIdx;
    if (nameIdx >= 0) return nameIdx;
    return 0;
  }

  final tCol = colTitle();
  final dCol = dueIdx >= 0 ? dueIdx : dueAlt;

  for (var i = 1; i < rows.length; i++) {
    final row = rows[i];
    if (row.isEmpty) {
      skipped++;
      continue;
    }
    final title = tCol < row.length ? row[tCol].toString().trim() : '';
    if (title.isEmpty) {
      skipped++;
      continue;
    }
    DateTime? due;
    if (dCol >= 0 && dCol < row.length) {
      final raw = row[dCol].toString().trim();
      if (raw.isNotEmpty) {
        due = DateTime.tryParse(raw.contains('T') ? raw : '${raw}T12:00:00');
      }
    }
    tasks.add(
      newLocalTask(
        id: uuid.v4(),
        title: title,
        dueDate: due,
        listId: defaultListId,
      ),
    );
    imported++;
  }

  return CsvImportResult(
    imported: imported,
    skipped: skipped,
    errors: errors,
    tasks: tasks,
  );
}
