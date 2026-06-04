import 'supabase_bootstrap.dart';

/// Supabase project URL (after [SupabaseEnv.load] in [main]).
String get supabaseUrl => SupabaseEnv.url;

/// Supabase anon key (after [SupabaseEnv.load] in [main]).
String get supabaseAnonKey => SupabaseEnv.anonKey;

bool get isSupabaseConfigured => SupabaseEnv.isConfigured;
