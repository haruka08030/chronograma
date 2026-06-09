import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import '../../app/supabase_config.dart';
import '../habits/models/habit.dart';
import '../habits/providers/habits_providers.dart';
import '../todo/models/task.dart';
import '../todo/providers/todo_providers.dart';
import '../google/google_calendar_service.dart';
import '../google/google_connection_provider.dart';
import 'supabase_sync_repository.dart';
import 'sync_status.dart';

class SyncNotifier extends Notifier<SyncState> {
  static const _debouncePush = Duration(milliseconds: 1800);

  StreamSubscription<AuthState>? _authSub;
  Timer? _pushTimer;
  bool _didSetup = false;
  bool _isApplyingRemote = false;
  /// True while [pullSync] holds the sync lock (avoid reading [state] from listeners during [build]).
  bool _pullSyncInProgress = false;

  @override
  SyncState build() {
    if (!_didSetup) {
      _setup();
      _didSetup = true;
    }
    return SyncState(
      status: SyncStatus.idle,
      userEmail: _repository?.currentUser?.email,
    );
  }

  SupabaseSyncRepository? get _repository => ref.read(supabaseSyncRepositoryProvider);

  void _setup() {
    ref.onDispose(() {
      _authSub?.cancel();
      _pushTimer?.cancel();
    });

    ref.listen<SupabaseSyncRepository?>(supabaseSyncRepositoryProvider, (_, next) {
      _bindAuth(next);
      if (next?.currentUser != null) {
        Future.microtask(pullSync);
      } else {
        Future.microtask(() {
          state = state.copyWith(
            status: SyncStatus.idle,
            userEmail: null,
            clearError: true,
          );
        });
      }
    });

    void schedulePush() {
      final repo = _repository;
      final userId = repo?.currentUser?.id;
      if (repo == null || userId == null) return;
      _schedulePush(repo, userId);
    }

    ref.listen<List<Task>>(todoListProvider, (previousTasks, nextTasks) {
      if (identical(previousTasks, nextTasks)) return;
      if (_isApplyingRemote) return;
      if (_pullSyncInProgress) return;
      schedulePush();
    });

    ref.listen<List<Habit>>(habitsListProvider, (previousHabits, nextHabits) {
      if (identical(previousHabits, nextHabits)) return;
      if (_isApplyingRemote) return;
      if (_pullSyncInProgress) return;
      schedulePush();
    });

    ref.listen(taskListsProvider, (previous, next) {
      if (identical(previous, next)) return;
      if (_isApplyingRemote) return;
      if (_pullSyncInProgress) return;
      schedulePush();
    });

    ref.listen(listSectionsProvider, (previous, next) {
      if (identical(previous, next)) return;
      if (_isApplyingRemote) return;
      if (_pullSyncInProgress) return;
      schedulePush();
    });

    _bindAuth(_repository);
    if (_repository?.currentUser != null) {
      Future.microtask(pullSync);
    }
  }

  void _bindAuth(SupabaseSyncRepository? repo) {
    _authSub?.cancel();
    if (repo == null) return;
    // Initial userEmail is set by [build] return value; do not write [state] here (still inside [build]).
    _authSub = repo.authStateChanges.listen((event) {
      final user = event.session?.user;
      state = state.copyWith(userEmail: user?.email, clearError: true);
      final session = event.session;
      if (session != null) {
        final refresh = session.providerRefreshToken;
        if (refresh != null && refresh.isNotEmpty) {
          final gcal = GoogleCalendarService.tryCreate();
          if (gcal != null) {
            unawaited(
              gcal.storeRefreshToken(refresh).then((_) {
                ref.read(googleConnectedProvider.notifier).setConnected(true);
              }).catchError((_) {}),
            );
          }
        }
      }
      if (event.event == AuthChangeEvent.signedOut) {
        unawaited(ref.read(googleConnectedProvider.notifier).setConnected(false));
        ref.read(calendarEventsProvider.notifier).state = [];
        final gcal = GoogleCalendarService.tryCreate();
        if (gcal != null) {
          unawaited(gcal.disconnect().catchError((_) {}));
        }
      }
      if (user != null) {
        Future.microtask(pullSync);
      }
    });
  }

  void _clearListSelectionIfStale(Set<String> listIds) {
    final sel = ref.read(selectedTaskListIdProvider);
    if (sel != null && !listIds.contains(sel)) {
      ref.read(selectedTaskListIdProvider.notifier).state = null;
    }
  }

  Future<void> pullSync() async {
    if (_pullSyncInProgress) return;

    final repo = _repository;
    final user = repo?.currentUser;
    if (repo == null) {
      state = state.copyWith(
        status: SyncStatus.idle,
        lastError: 'Supabase が未設定です。起動オプションを確認してください。',
      );
      return;
    }
    if (user == null) {
      state = state.copyWith(
        status: SyncStatus.idle,
        lastError: '同期にはログインが必要です。',
      );
      return;
    }

    _pullSyncInProgress = true;
    state = state.copyWith(status: SyncStatus.syncing, clearError: true);

    try {
      final remoteLists = await repo.fetchLists(user.id);
      final remoteSections = await repo.fetchListSections(user.id);
      final remoteTasks = await repo.fetchTasks(user.id);
      final remoteHabits = await repo.fetchHabits(user.id);
      final localTasks = ref.read(todoListProvider);
      final localHabits = ref.read(habitsListProvider);
      if (remoteTasks.isEmpty &&
          remoteHabits.isEmpty &&
          (localTasks.isNotEmpty || localHabits.isNotEmpty)) {
        final merged = SupabaseSyncRepository.mergeListsForPush(
          stored: ref.read(taskListsProvider),
          tasks: localTasks,
        );
        var error = await repo.pushListsSync(user.id, merged);
        if (error != null) {
          state = state.copyWith(
            status: SyncStatus.failed,
            lastError: error,
          );
          return;
        }
        error = await repo.pushListSectionsUpsert(user.id, ref.read(listSectionsProvider));
        if (error != null) {
          state = state.copyWith(
            status: SyncStatus.failed,
            lastError: error,
          );
          return;
        }
        error = await repo.pushTasks(user.id, localTasks);
        if (error != null) {
          state = state.copyWith(
            status: SyncStatus.failed,
            lastError: error,
          );
          return;
        }
        final habitsError = await repo.pushHabits(user.id, localHabits);
        if (habitsError != null) {
          state = state.copyWith(
            status: SyncStatus.failed,
            lastError: habitsError,
          );
          return;
        }
        _isApplyingRemote = true;
        ref.read(taskListsProvider.notifier).replaceAll(merged);
        _isApplyingRemote = false;
      } else {
        _isApplyingRemote = true;
        ref.read(taskListsProvider.notifier).replaceAll(remoteLists);
        ref.read(listSectionsProvider.notifier).replaceAll(remoteSections);
        ref.read(todoListProvider.notifier).replaceAll(remoteTasks);
        ref.read(habitsListProvider.notifier).replaceAll(remoteHabits);
        _isApplyingRemote = false;
        _clearListSelectionIfStale(remoteLists.map((l) => l.id).toSet());
      }
      state = state.copyWith(
        status: SyncStatus.synced,
        lastSyncedAt: DateTime.now(),
        clearError: true,
      );
    } catch (e) {
      _isApplyingRemote = false;
      state = state.copyWith(
        status: SyncStatus.failed,
        lastError: '同期に失敗しました: $e',
      );
    } finally {
      _pullSyncInProgress = false;
    }
  }

  Future<void> _pushSync(SupabaseSyncRepository repo, String userId) async {
    final localTasks = ref.read(todoListProvider);
    final localHabits = ref.read(habitsListProvider);
    final localLists = ref.read(taskListsProvider);
    final localSections = ref.read(listSectionsProvider);
    final merged = SupabaseSyncRepository.mergeListsForPush(
      stored: localLists,
      tasks: localTasks,
    );

    var error = await repo.pushListsSync(userId, merged);
    if (error != null) {
      state = state.copyWith(status: SyncStatus.failed, lastError: error);
      return;
    }
    error = await repo.pushListSectionsUpsert(userId, localSections);
    if (error != null) {
      state = state.copyWith(status: SyncStatus.failed, lastError: error);
      return;
    }
    error = await repo.pushTasks(userId, localTasks);
    if (error != null) {
      state = state.copyWith(status: SyncStatus.failed, lastError: error);
      return;
    }
    final habitsError = await repo.pushHabits(userId, localHabits);
    if (habitsError != null) {
      state = state.copyWith(status: SyncStatus.failed, lastError: habitsError);
      return;
    }
    _isApplyingRemote = true;
    ref.read(taskListsProvider.notifier).replaceAll(merged);
    _isApplyingRemote = false;
    state = state.copyWith(
      status: SyncStatus.synced,
      lastSyncedAt: DateTime.now(),
      clearError: true,
    );
  }

  void _schedulePush(SupabaseSyncRepository repo, String userId) {
    _pushTimer?.cancel();
    _pushTimer = Timer(_debouncePush, () {
      unawaited(_pushSync(repo, userId));
    });
  }

  Future<String?> signInWithOtp(String email) async {
    final repo = _repository;
    if (repo == null) {
      state = state.copyWith(lastError: 'Supabase が未設定です。');
      return 'Supabase が未設定です。';
    }
    final normalized = email.trim();
    if (normalized.isEmpty) {
      state = state.copyWith(lastError: 'メールアドレスを入力してください。');
      return 'メールアドレスを入力してください。';
    }
    final error = await repo.signInWithOtp(normalized);
    if (error != null) {
      state = state.copyWith(status: SyncStatus.failed, lastError: error);
      return error;
    }
    state = state.copyWith(
      status: SyncStatus.idle,
      clearError: true,
    );
    return null;
  }

  Future<String?> signInWithGoogle() async {
    final repo = _repository;
    if (repo == null) {
      state = state.copyWith(lastError: 'Supabase が未設定です。');
      return 'Supabase が未設定です。';
    }
    final error = await repo.signInWithGoogle();
    if (error != null) {
      state = state.copyWith(status: SyncStatus.failed, lastError: error);
      return error;
    }
    state = state.copyWith(
      status: SyncStatus.idle,
      clearError: true,
    );
    return null;
  }

  Future<void> signOut() async {
    final repo = _repository;
    if (repo == null) return;
    final gcal = GoogleCalendarService.tryCreate();
    if (gcal != null) {
      await gcal.disconnect().catchError((_) {});
    }
    await ref.read(googleConnectedProvider.notifier).setConnected(false);
    ref.read(calendarEventsProvider.notifier).state = [];
    await repo.signOut();
    state = state.copyWith(
      status: SyncStatus.idle,
      userEmail: null,
      clearError: true,
    );
  }
}

final syncNotifierProvider =
    NotifierProvider<SyncNotifier, SyncState>(SyncNotifier.new);

final supabaseSyncRepositoryProvider = Provider<SupabaseSyncRepository?>((ref) {
  if (!isSupabaseConfigured) return null;
  final client = Supabase.instance.client;
  return SupabaseSyncRepository(client);
});
