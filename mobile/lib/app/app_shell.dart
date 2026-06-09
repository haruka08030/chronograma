import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../features/sync/sync_notifier.dart';
import '../features/timer/global_timer_overlay.dart';
import '../shared/widgets/glass_bottom_bar.dart';

class AppShell extends ConsumerWidget {
  const AppShell({
    super.key,
    required this.navigationShell,
  });

  final StatefulNavigationShell navigationShell;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    ref.watch(syncNotifierProvider);
    return Scaffold(
      extendBody: true,
      body: Stack(
        children: [
          navigationShell,
          const GlobalTimerOverlay(),
        ],
      ),
      bottomNavigationBar: GlassBottomBar(
        currentIndex: navigationShell.currentIndex,
        onTap: (index) => _onTap(context, index),
      ),
    );
  }

  void _onTap(BuildContext context, int index) {
    navigationShell.goBranch(
      index,
      initialLocation: index == navigationShell.currentIndex,
    );
  }
}
