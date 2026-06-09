/// Shared time-grid metrics, mirroring Web `src/lib/timeGrid.ts`.
/// Google Calendar-like density (slightly tighter than Web's 60px/hour).
library;

const double kHourHeight = 56;
const double kGutterWidth = 52;
const int kSnapMinutes = 15;
const double kTimeGridHeight = kHourHeight * 24;
const double kMinBlockHeight = 20;

/// Parses `HH:mm` (local) to minutes-from-midnight, clamped to [0, 1440].
int? parseHhmmToMinutes(String? hhmm) {
  if (hhmm == null || hhmm.isEmpty) return null;
  final parts = hhmm.split(':');
  if (parts.length < 2) return null;
  final h = int.tryParse(parts[0].trim());
  final m = int.tryParse(parts[1].trim());
  if (h == null || m == null) return null;
  return (h * 60 + m).clamp(0, 24 * 60);
}

/// `HH:mm` -> Y offset in logical px. Invalid -> 0.
double timeToY(String? hhmm) {
  final m = parseHhmmToMinutes(hhmm);
  if (m == null) return 0;
  return m / 60.0 * kHourHeight;
}

double minutesToY(int minutes) => minutes / 60.0 * kHourHeight;

int yToMinutes(double y) => (y / kHourHeight * 60).round();

String minutesToHhmm(int minutes) {
  final m = minutes.clamp(0, 24 * 60 - 1);
  final h = m ~/ 60;
  final mm = m % 60;
  return '${h.toString().padLeft(2, '0')}:${mm.toString().padLeft(2, '0')}';
}

/// Snaps minutes to the nearest [kSnapMinutes] increment, clamped to a slot.
int snapToSlot(int minutes) {
  final snapped = (minutes / kSnapMinutes).round() * kSnapMinutes;
  return snapped.clamp(0, 24 * 60 - kSnapMinutes);
}

/// Gutter hour label, e.g. `07:00`. Midnight is rendered blank (matches Web).
String hourLabel(int hour) =>
    hour <= 0 ? '' : '${hour.toString().padLeft(2, '0')}:00';
