import '../../shared/time_grid/time_grid_metrics.dart';
import '../todo/models/task.dart';

/// Web `PlannedSource`。
enum PlannedSource { google, task, habit }

/// Web `MatchStatus`。
enum MatchStatus { matched, timeDrift, plannedOnly, actualOnly }

/// 予定側の正規化アイテム（Web `PlannedItem` 相当）。
class PlannedItem {
  const PlannedItem({
    required this.id,
    required this.summary,
    required this.startTime,
    required this.endTime,
    required this.source,
  });

  final String id;
  final String summary;
  final String startTime;
  final String endTime;
  final PlannedSource source;
}

class MatchedPair {
  const MatchedPair({
    required this.status,
    this.planned,
    this.actual,
    this.driftMinutes,
  });

  final MatchStatus status;
  final PlannedItem? planned;
  final Task? actual;
  final int? driftMinutes;
}

double _titleSimilarity(String a, String b) {
  final na = a.toLowerCase().trim();
  final nb = b.toLowerCase().trim();
  if (na == nb) return 1;
  if (na.isNotEmpty && nb.isNotEmpty && (na.contains(nb) || nb.contains(na))) {
    return 0.8;
  }
  final wordsA = na.split(RegExp(r'\s+')).where((w) => w.isNotEmpty).toSet();
  final wordsB = nb.split(RegExp(r'\s+')).where((w) => w.isNotEmpty).toSet();
  if (wordsA.isEmpty || wordsB.isEmpty) return 0;
  var overlap = 0;
  for (final w in wordsA) {
    if (wordsB.contains(w)) overlap++;
  }
  return overlap / (wordsA.length > wordsB.length ? wordsA.length : wordsB.length);
}

double _timeOverlapRatio(String pStart, String pEnd, String aStart, String aEnd) {
  final ps = parseHhmmToMinutes(pStart) ?? 0;
  final pe = parseHhmmToMinutes(pEnd) ?? 0;
  final as_ = parseHhmmToMinutes(aStart) ?? 0;
  final ae = parseHhmmToMinutes(aEnd) ?? 0;
  final overlapStart = ps > as_ ? ps : as_;
  final overlapEnd = pe < ae ? pe : ae;
  final overlap = (overlapEnd - overlapStart) > 0 ? (overlapEnd - overlapStart) : 0;
  final union = (pe > ae ? pe : ae) - (ps < as_ ? ps : as_);
  if (union == 0) return 0;
  return overlap / union;
}

const double _titleThreshold = 0.3;
const double _timeOverlapThreshold = 0.15;
const int _driftThresholdMinutes = 10;

/// 予定とタイムログを突き合わせる（Web `matchPlanAndActualForDate` の移植）。
List<MatchedPair> matchPlanAndActual(
  List<PlannedItem> planned,
  List<Task> actualLogs,
) {
  final timedPlanned = planned
      .where((e) => e.startTime.isNotEmpty && e.endTime.isNotEmpty)
      .toList();
  final timedActual = actualLogs
      .where((t) =>
          (t.startTime?.isNotEmpty ?? false) && (t.endTime?.isNotEmpty ?? false))
      .toList();

  final usedPlanned = <String>{};
  final usedActual = <String>{};
  final pairs = <MatchedPair>[];

  final candidates = <({int pIdx, int aIdx, double score})>[];
  for (var pi = 0; pi < timedPlanned.length; pi++) {
    final p = timedPlanned[pi];
    for (var ai = 0; ai < timedActual.length; ai++) {
      final a = timedActual[ai];
      final tSim = _titleSimilarity(p.summary, a.title);
      if (tSim < _titleThreshold) continue;
      final overlap = _timeOverlapRatio(p.startTime, p.endTime, a.startTime!, a.endTime!);
      if (overlap < _timeOverlapThreshold && tSim < 0.8) continue;
      candidates.add((pIdx: pi, aIdx: ai, score: tSim * 0.6 + overlap * 0.4));
    }
  }
  candidates.sort((a, b) => b.score.compareTo(a.score));

  for (final c in candidates) {
    final p = timedPlanned[c.pIdx];
    final a = timedActual[c.aIdx];
    if (usedPlanned.contains(p.id) || usedActual.contains(a.id)) continue;
    usedPlanned.add(p.id);
    usedActual.add(a.id);

    final startDrift =
        ((parseHhmmToMinutes(p.startTime) ?? 0) - (parseHhmmToMinutes(a.startTime) ?? 0)).abs();
    final endDrift =
        ((parseHhmmToMinutes(p.endTime) ?? 0) - (parseHhmmToMinutes(a.endTime) ?? 0)).abs();
    final maxDrift = startDrift > endDrift ? startDrift : endDrift;

    if (maxDrift <= _driftThresholdMinutes) {
      pairs.add(MatchedPair(status: MatchStatus.matched, planned: p, actual: a));
    } else {
      pairs.add(MatchedPair(
        status: MatchStatus.timeDrift,
        planned: p,
        actual: a,
        driftMinutes: maxDrift,
      ));
    }
  }

  for (final p in timedPlanned) {
    if (!usedPlanned.contains(p.id)) {
      pairs.add(MatchedPair(status: MatchStatus.plannedOnly, planned: p));
    }
  }
  for (final a in timedActual) {
    if (!usedActual.contains(a.id)) {
      pairs.add(MatchedPair(status: MatchStatus.actualOnly, actual: a));
    }
  }
  return pairs;
}
