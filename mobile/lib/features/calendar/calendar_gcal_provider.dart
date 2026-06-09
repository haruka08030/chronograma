import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../google/google_calendar_service.dart';
import '../google/google_connection_provider.dart';

Future<void> refreshCalendarEvents(
  WidgetRef ref, {
  required DateTime rangeStart,
  required DateTime rangeEnd,
}) async {
  if (!ref.read(googleConnectedProvider)) return;
  final svc = GoogleCalendarService.tryCreate();
  if (svc == null) return;
  try {
    final events = await svc.fetchEvents(
      timeMin: rangeStart,
      timeMax: rangeEnd,
    );
    ref.read(calendarEventsProvider.notifier).state = events;
  } catch (_) {
    ref.read(calendarEventsProvider.notifier).state = [];
    await ref.read(googleConnectedProvider.notifier).setConnected(false);
  }
}
