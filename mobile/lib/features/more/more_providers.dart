import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../todo/providers/todo_providers.dart';

const _notificationsEnabledKey = 'settings_notifications_enabled';

final notificationsEnabledProvider =
    NotifierProvider<NotificationsEnabledNotifier, bool>(
  NotificationsEnabledNotifier.new,
);

class NotificationsEnabledNotifier extends Notifier<bool> {
  @override
  bool build() {
    final box = ref.read(hiveBoxProvider);
    final raw = box.get(_notificationsEnabledKey);
    return raw == true;
  }

  void setEnabled(bool value) {
    final box = ref.read(hiveBoxProvider);
    box.put(_notificationsEnabledKey, value);
    state = value;
  }
}
