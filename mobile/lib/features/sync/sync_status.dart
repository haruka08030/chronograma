enum SyncStatus {
  idle,
  syncing,
  synced,
  offline,
  failed,
}

class SyncState {
  const SyncState({
    required this.status,
    this.lastSyncedAt,
    this.lastError,
    this.userEmail,
  });

  final SyncStatus status;
  final DateTime? lastSyncedAt;
  final String? lastError;
  final String? userEmail;

  SyncState copyWith({
    SyncStatus? status,
    DateTime? lastSyncedAt,
    String? lastError,
    String? userEmail,
    bool clearError = false,
  }) {
    return SyncState(
      status: status ?? this.status,
      lastSyncedAt: lastSyncedAt ?? this.lastSyncedAt,
      lastError: clearError ? null : (lastError ?? this.lastError),
      userEmail: userEmail ?? this.userEmail,
    );
  }
}
