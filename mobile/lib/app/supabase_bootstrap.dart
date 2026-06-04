import 'package:flutter/services.dart';

/// Resolves Supabase URL and anon key for the mobile app.
///
/// Priority:
/// 1. `--dart-define=SUPABASE_URL` / `--dart-define=SUPABASE_ANON_KEY` (compile-time)
/// 2. `assets/supabase.env` (KEY=value; supports `VITE_*` aliases from the web `.env`)
class SupabaseEnv {
  SupabaseEnv._();

  static String _url = '';
  static String _anonKey = '';

  static String get url => _url;
  static String get anonKey => _anonKey;
  static bool get isConfigured => _url.isNotEmpty && _anonKey.isNotEmpty;

  /// Call once in [main] before [Supabase.initialize].
  static Future<void> load() async {
    const fromDefineUrl = String.fromEnvironment('SUPABASE_URL');
    const fromDefineKey = String.fromEnvironment('SUPABASE_ANON_KEY');
    if (fromDefineUrl.isNotEmpty && fromDefineKey.isNotEmpty) {
      _url = fromDefineUrl;
      _anonKey = fromDefineKey;
      return;
    }

    try {
      final raw = await rootBundle.loadString('assets/supabase.env');
      final map = _parseDotEnv(raw);
      _url = _firstNonEmpty([
        map['SUPABASE_URL'],
        map['VITE_SUPABASE_URL'],
      ]);
      _anonKey = _firstNonEmpty([
        map['SUPABASE_ANON_KEY'],
        map['VITE_SUPABASE_ANON_KEY'],
      ]);
    } catch (_) {
      _url = '';
      _anonKey = '';
    }
  }

  static Map<String, String> _parseDotEnv(String content) {
    final out = <String, String>{};
    for (var line in content.split('\n')) {
      final trimmed = line.trim();
      if (trimmed.isEmpty || trimmed.startsWith('#')) continue;
      final eq = trimmed.indexOf('=');
      if (eq <= 0) continue;
      final key = trimmed.substring(0, eq).trim();
      var value = trimmed.substring(eq + 1).trim();
      if ((value.startsWith('"') && value.endsWith('"')) ||
          (value.startsWith("'") && value.endsWith("'"))) {
        value = value.substring(1, value.length - 1);
      }
      out[key] = value;
    }
    return out;
  }

  static String _firstNonEmpty(List<String?> candidates) {
    for (final c in candidates) {
      final t = (c ?? '').trim();
      if (t.isNotEmpty) return t;
    }
    return '';
  }
}
