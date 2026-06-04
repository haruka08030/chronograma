import 'package:flutter/material.dart';

import '../sync_status.dart';

class SyncStatusChip extends StatelessWidget {
  const SyncStatusChip({
    super.key,
    required this.state,
    this.compact = false,
  });

  final SyncState state;
  final bool compact;

  @override
  Widget build(BuildContext context) {
    final (label, color) = _labelAndColor(context);

    if (compact) {
      return Icon(
        _iconForStatus(),
        size: 22,
        color: color,
      );
    }

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
      decoration: BoxDecoration(
        color: Theme.of(context).colorScheme.surfaceContainerHigh,
        borderRadius: BorderRadius.circular(999),
      ),
      child: Text(
        label,
        style: Theme.of(context).textTheme.labelSmall?.copyWith(
              fontSize: 10,
              fontWeight: FontWeight.w700,
              letterSpacing: 0.2,
              color: color,
            ),
      ),
    );
  }

  (String, Color) _labelAndColor(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    switch (state.status) {
      case SyncStatus.idle:
        return ('待機', cs.onSurfaceVariant);
      case SyncStatus.syncing:
        return ('同期中…', cs.primary);
      case SyncStatus.synced:
        final t = state.lastSyncedAt;
        if (t == null) return ('同期済み', cs.primary);
        final m = t.minute.toString().padLeft(2, '0');
        return ('同期: ${t.hour}:$m', cs.onSurfaceVariant);
      case SyncStatus.offline:
        return ('オフライン', cs.tertiary);
      case SyncStatus.failed:
        return ('失敗', cs.error);
    }
  }

  IconData _iconForStatus() {
    switch (state.status) {
      case SyncStatus.idle:
        return Icons.cloud_outlined;
      case SyncStatus.syncing:
        return Icons.sync;
      case SyncStatus.synced:
        return Icons.cloud_done_outlined;
      case SyncStatus.offline:
        return Icons.cloud_off_outlined;
      case SyncStatus.failed:
        return Icons.error_outline;
    }
  }
}
