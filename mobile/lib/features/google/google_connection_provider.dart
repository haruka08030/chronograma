import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'google_calendar_service.dart';

const _kGoogleConnected = 'google_connected';

final googleConnectedProvider =
    NotifierProvider<GoogleConnectedNotifier, bool>(GoogleConnectedNotifier.new);

class GoogleConnectedNotifier extends Notifier<bool> {
  @override
  bool build() {
    _load();
    return false;
  }

  Future<void> _load() async {
    final prefs = await SharedPreferences.getInstance();
    final v = prefs.getBool(_kGoogleConnected) ?? false;
    state = v;
  }

  Future<void> setConnected(bool value) async {
    state = value;
    final prefs = await SharedPreferences.getInstance();
    await prefs.setBool(_kGoogleConnected, value);
  }
}

final calendarEventsProvider =
    StateProvider<List<CalendarEventDto>>((ref) => []);
