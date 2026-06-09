import 'package:flutter_local_notifications/flutter_local_notifications.dart';
import 'package:timezone/data/latest.dart' as tz_data;
import 'package:timezone/timezone.dart' as tz;

class NotificationService {
  NotificationService._();

  static final NotificationService instance = NotificationService._();
  final FlutterLocalNotificationsPlugin _plugin = FlutterLocalNotificationsPlugin();
  bool _initialized = false;

  Future<void> ensureInitialized() async {
    if (_initialized) return;
    tz_data.initializeTimeZones();
    const android = AndroidInitializationSettings('@mipmap/ic_launcher');
    const ios = DarwinInitializationSettings();
    const settings = InitializationSettings(android: android, iOS: ios);
    await _plugin.initialize(settings: settings);
    _initialized = true;
  }

  Future<bool> requestPermissionsIfNeeded() async {
    await ensureInitialized();
    final ios = _plugin
        .resolvePlatformSpecificImplementation<IOSFlutterLocalNotificationsPlugin>();
    await ios?.requestPermissions(alert: true, badge: true, sound: true);
    final mac = _plugin
        .resolvePlatformSpecificImplementation<MacOSFlutterLocalNotificationsPlugin>();
    await mac?.requestPermissions(alert: true, badge: true, sound: true);
    final android = _plugin
        .resolvePlatformSpecificImplementation<AndroidFlutterLocalNotificationsPlugin>();
    final granted = await android?.requestNotificationsPermission();
    return granted ?? true;
  }

  Future<void> showBasic({
    required int id,
    required String title,
    required String body,
  }) async {
    await ensureInitialized();
    const details = NotificationDetails(
      android: AndroidNotificationDetails(
        'chronograma_general',
        'Chronograma',
        channelDescription: 'General notifications',
        importance: Importance.defaultImportance,
        priority: Priority.defaultPriority,
      ),
      iOS: DarwinNotificationDetails(),
    );
    await _plugin.show(
      id: id,
      title: title,
      body: body,
      notificationDetails: details,
    );
  }

  /// Schedules reminders for incomplete tasks with due dates (next 7 days).
  Future<void> rescheduleDueReminders({
    required List<({String id, String title, DateTime? dueDate, bool completed})> tasks,
  }) async {
    await ensureInitialized();
    await _plugin.cancelAll();
    final now = DateTime.now();
    var id = 1;
    for (final t in tasks) {
      if (t.completed || t.dueDate == null) continue;
      final due = DateTime(t.dueDate!.year, t.dueDate!.month, t.dueDate!.day, 9);
      if (due.isBefore(now)) continue;
      if (due.isAfter(now.add(const Duration(days: 7)))) continue;
      final scheduled = tz.TZDateTime.from(due, tz.local);
      await _plugin.zonedSchedule(
        id: id++,
        title: '期限: ${t.title}',
        body: '今日が期限です',
        scheduledDate: scheduled,
        notificationDetails: const NotificationDetails(
          android: AndroidNotificationDetails(
            'chronograma_due',
            'Due reminders',
            channelDescription: 'Task due date reminders',
          ),
          iOS: DarwinNotificationDetails(),
        ),
        androidScheduleMode: AndroidScheduleMode.exactAllowWhileIdle,
      );
    }
  }
}
