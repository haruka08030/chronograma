import 'package:flutter_riverpod/flutter_riverpod.dart';

/// Calendar / Log / Habits タブで共有する「選択中の日付」。
/// どのタブで日付を動かしても他タブに反映される（Web の selectedDate と同じ思想）。
final selectedDateProvider = StateProvider<DateTime>((ref) {
  final n = DateTime.now();
  return DateTime(n.year, n.month, n.day);
});
