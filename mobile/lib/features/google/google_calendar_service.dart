import 'package:supabase_flutter/supabase_flutter.dart';

import '../../app/supabase_config.dart';

const kGoogleCalendarScope = 'https://www.googleapis.com/auth/calendar.readonly';

class CalendarEventDto {
  const CalendarEventDto({
    required this.id,
    required this.summary,
    required this.date,
    this.description,
    this.startTime,
    this.endTime,
    this.isAllDay = false,
    this.colorId,
  });

  final String id;
  final String summary;
  final String date;
  final String? description;
  final String? startTime;
  final String? endTime;
  final bool isAllDay;
  final String? colorId;

  factory CalendarEventDto.fromJson(Map<String, dynamic> j) {
    return CalendarEventDto(
      id: j['id'] as String,
      summary: j['summary'] as String? ?? '(無題)',
      date: j['date'] as String,
      description: j['description'] as String?,
      startTime: j['startTime'] as String?,
      endTime: j['endTime'] as String?,
      isAllDay: j['isAllDay'] as bool? ?? false,
      colorId: j['colorId'] as String?,
    );
  }
}

class GoogleCalendarService {
  GoogleCalendarService(this._client);

  final SupabaseClient _client;

  static GoogleCalendarService? tryCreate() {
    if (!isSupabaseConfigured) return null;
    return GoogleCalendarService(Supabase.instance.client);
  }

  Future<void> storeRefreshToken(String refreshToken) async {
    final res = await _client.functions.invoke(
      'google-calendar',
      body: {
        'action': 'store',
        'refresh_token': refreshToken,
        'scope': kGoogleCalendarScope,
      },
    );
    if (res.status != 200) {
      throw Exception(res.data?['error'] ?? 'Failed to store Google token');
    }
  }

  Future<void> disconnect() async {
    await _client.functions.invoke(
      'google-calendar',
      body: {'action': 'disconnect'},
    );
  }

  Future<List<CalendarEventDto>> fetchEvents({
    required DateTime timeMin,
    required DateTime timeMax,
  }) async {
    final res = await _client.functions.invoke(
      'google-calendar',
      body: {
        'action': 'events',
        'timeMin': timeMin.toUtc().toIso8601String(),
        'timeMax': timeMax.toUtc().toIso8601String(),
      },
    );
    final data = res.data;
    if (data is Map && data['error'] != null) {
      throw Exception(data['error'] as String);
    }
    final events = (data is Map ? data['events'] : null) as List<dynamic>? ?? [];
    return events
        .map((e) => CalendarEventDto.fromJson(Map<String, dynamic>.from(e as Map)))
        .toList();
  }
}
