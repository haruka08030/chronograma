import 'package:supabase_flutter/supabase_flutter.dart';

import '../habits/models/habit.dart';
import '../todo/models/task.dart';

class SupabaseSyncRepository {
  SupabaseSyncRepository(this._client);

  final SupabaseClient _client;

  User? get currentUser => _client.auth.currentUser;

  Stream<AuthState> get authStateChanges => _client.auth.onAuthStateChange;

  Future<String?> signInWithOtp(String email) async {
    try {
      final redirectTo = _defaultMobileRedirectUrl();
      await _client.auth.signInWithOtp(
        email: email.trim(),
        emailRedirectTo: redirectTo,
      );
      return null;
    } on AuthException catch (e) {
      return e.message;
    } catch (e) {
      return e.toString();
    }
  }

  Future<String?> signInWithGoogle() async {
    try {
      final redirectTo = _defaultMobileRedirectUrl();
      await _client.auth.signInWithOAuth(
        OAuthProvider.google,
        redirectTo: redirectTo,
        authScreenLaunchMode: LaunchMode.externalApplication,
      );
      return null;
    } on AuthException catch (e) {
      return e.message;
    } catch (e) {
      return e.toString();
    }
  }

  Future<void> signOut() async {
    await _client.auth.signOut();
  }

  Future<List<Task>> fetchTasks(String userId) async {
    try {
      final rows = await _client
          .from('tasks')
          .select(
            'id,list_id,parent_id,section_id,title,description,completed,'
            'sort_order,due_date,end_date,priority,tags,recurrence,'
            'is_time_log,start_time,end_time,created_at,updated_at',
          )
          .eq('user_id', userId);
      return (rows as List<dynamic>)
          .map((row) => Task.fromJson(Map<String, dynamic>.from(row as Map)))
          .toList();
    } on PostgrestException {
      rethrow;
    }
  }

  Future<List<Habit>> fetchHabits(String userId) async {
    try {
      final rows = await _client
          .from('habits')
          .select(
            'id,title,color,time_mode,start_time,end_time,frequency,'
            'completed_dates,created_at,updated_at',
          )
          .eq('user_id', userId);
      return (rows as List<dynamic>)
          .map((row) => Habit.fromJson(Map<String, dynamic>.from(row as Map)))
          .toList();
    } on PostgrestException {
      rethrow;
    }
  }

  Future<String?> pushTasks(String userId, List<Task> tasks) async {
    try {
      final listErr = await _ensureInboxList(userId);
      if (listErr != null) return listErr;

      final nowIso = DateTime.now().toUtc().toIso8601String();
      final taskRows = tasks.map((t) => _taskToRow(userId, t, nowIso)).toList();
      await _client.from('tasks').upsert(taskRows, onConflict: 'id');

      final remoteRows = await _client.from('tasks').select('id').eq('user_id', userId);
      final remoteIds = (remoteRows as List<dynamic>)
          .map((r) => (r as Map<String, dynamic>)['id'] as String)
          .toSet();
      final localIds = tasks.map((t) => t.id).toSet();
      final staleIds = remoteIds.where((id) => !localIds.contains(id)).toList();
      if (staleIds.isNotEmpty) {
        await _client.from('tasks').delete().inFilter('id', staleIds);
      }
      return null;
    } on PostgrestException catch (e) {
      return e.message;
    } catch (e) {
      return e.toString();
    }
  }

  Future<String?> pushHabits(String userId, List<Habit> habits) async {
    try {
      final nowIso = DateTime.now().toUtc().toIso8601String();
      final rows = habits.map((h) => _habitToRow(userId, h, nowIso)).toList();
      await _client.from('habits').upsert(rows, onConflict: 'id');

      final remoteRows = await _client.from('habits').select('id').eq('user_id', userId);
      final remoteIds = (remoteRows as List<dynamic>)
          .map((r) => (r as Map<String, dynamic>)['id'] as String)
          .toSet();
      final localIds = habits.map((h) => h.id).toSet();
      final staleIds = remoteIds.where((id) => !localIds.contains(id)).toList();
      if (staleIds.isNotEmpty) {
        await _client.from('habits').delete().inFilter('id', staleIds);
      }
      return null;
    } on PostgrestException catch (e) {
      return e.message;
    } catch (e) {
      return e.toString();
    }
  }

  Future<String?> _ensureInboxList(String userId) async {
    try {
      await _client.from('lists').upsert({
        'id': Task.inboxListId,
        'user_id': userId,
        'name': '未分類',
        'color': '#6366f1',
        'sort_order': 0,
        'updated_at': DateTime.now().toUtc().toIso8601String(),
      }, onConflict: 'id');
      return null;
    } on PostgrestException catch (e) {
      return e.message;
    } catch (e) {
      return e.toString();
    }
  }

  Map<String, dynamic> _taskToRow(String userId, Task task, String nowIso) {
    final created = task.createdAt ?? nowIso;
    return {
      'id': task.id,
      'user_id': userId,
      'list_id': task.listId.isNotEmpty ? task.listId : Task.inboxListId,
      'parent_id': task.parentId,
      'section_id': task.sectionId,
      'title': task.title,
      'description': task.description,
      'completed': task.completed,
      'sort_order': task.sortOrder,
      'due_date': task.dueDate == null ? null : _toDateOnly(task.dueDate!),
      'end_date': task.endDate == null ? null : _toDateOnly(task.endDate!),
      'priority': task.priority.name,
      'tags': task.tags,
      'recurrence': task.recurrence,
      'is_time_log': task.isTimeLog,
      'start_time': task.startTime,
      'end_time': task.endTime,
      'created_at': created,
      'updated_at': nowIso,
    };
  }

  Map<String, dynamic> _habitToRow(String userId, Habit habit, String nowIso) {
    return {
      'id': habit.id,
      'user_id': userId,
      'title': habit.title,
      'color': habit.color,
      'time_mode': habit.timeMode.name,
      'start_time': habit.startTime,
      'end_time': habit.endTime,
      'frequency': habit.frequency,
      'completed_dates': habit.completedDates,
      'created_at': habit.createdAt,
      'updated_at': nowIso,
    };
  }

  /// Calendar date in local timezone (matches date picker / Web `due_date`).
  String _toDateOnly(DateTime dateTime) {
    final d = DateTime(dateTime.year, dateTime.month, dateTime.day);
    final month = d.month.toString().padLeft(2, '0');
    final day = d.day.toString().padLeft(2, '0');
    return '${d.year}-$month-$day';
  }

  String _defaultMobileRedirectUrl() {
    return 'io.supabase.flutter://signin-callback';
  }
}
