import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:hive_flutter/hive_flutter.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import 'app/supabase_bootstrap.dart';
import 'app/chronograma_app.dart';
import 'features/habits/providers/habits_providers.dart';
import 'features/todo/providers/todo_providers.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();

  await SupabaseEnv.load();
  if (SupabaseEnv.isConfigured) {
    await Supabase.initialize(
      url: SupabaseEnv.url,
      anonKey: SupabaseEnv.anonKey,
    );
  }

  await Hive.initFlutter();
  final box = await Hive.openBox<dynamic>('chronograma');

  runApp(
    ProviderScope(
      overrides: [
        hiveBoxProvider.overrideWithValue(box),
        habitsHiveBoxProvider.overrideWithValue(box),
      ],
      child: const ChronogramaApp(),
    ),
  );
}
