/// Web `src/lib/backupFormat.ts` と揃えた JSON バックアップ（schema v3）。
const int backupSchemaVersion = 3;

int readOrder(Map<String, dynamic> row) {
  final v = row['order'] ?? row['sortOrder'] ?? row['sort_order'];
  if (v is int) return v;
  if (v is String) return int.tryParse(v) ?? 0;
  return 0;
}

List<dynamic> readSectionsArray(Map<String, dynamic> data) {
  final raw = data['listSections'] ?? data['list_sections'] ?? data['sections'];
  if (raw is List) return raw;
  return const [];
}

Map<String, dynamic> buildBackupExportMap({
  required List<Map<String, dynamic>> tasks,
  required List<Map<String, dynamic>> habits,
  required List<Map<String, dynamic>> lists,
  required List<Map<String, dynamic>> listSections,
}) {
  return {
    'schemaVersion': backupSchemaVersion,
    'exportedAt': DateTime.now().toUtc().toIso8601String(),
    'tasks': tasks,
    'habits': habits,
    'lists': lists,
    'listSections': listSections,
  };
}
