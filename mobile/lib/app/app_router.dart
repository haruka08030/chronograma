import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../features/calendar/calendar_screen.dart';
import '../features/habits/habits_screen.dart';
import '../features/log/log_screen.dart';
import '../features/more/more_screen.dart';
import '../features/todo/screens/todo_screen.dart';
import 'app_shell.dart';

final GlobalKey<NavigatorState> rootNavigatorKey = GlobalKey<NavigatorState>();

GoRouter createAppRouter() {
  return GoRouter(
    navigatorKey: rootNavigatorKey,
    initialLocation: '/todo',
    routes: [
      StatefulShellRoute.indexedStack(
        builder: (context, state, navigationShell) {
          return AppShell(navigationShell: navigationShell);
        },
        branches: [
          StatefulShellBranch(
            routes: [
              GoRoute(
                path: '/todo',
                name: 'todo',
                pageBuilder: (context, state) => const NoTransitionPage<void>(
                  child: TodoScreen(),
                ),
              ),
            ],
          ),
          StatefulShellBranch(
            routes: [
              GoRoute(
                path: '/calendar',
                name: 'calendar',
                pageBuilder: (context, state) => const NoTransitionPage<void>(
                  child: CalendarScreen(),
                ),
              ),
            ],
          ),
          StatefulShellBranch(
            routes: [
              GoRoute(
                path: '/habits',
                name: 'habits',
                pageBuilder: (context, state) => const NoTransitionPage<void>(
                  child: HabitsScreen(),
                ),
              ),
            ],
          ),
          StatefulShellBranch(
            routes: [
              GoRoute(
                path: '/log',
                name: 'log',
                pageBuilder: (context, state) => const NoTransitionPage<void>(
                  child: LogScreen(),
                ),
              ),
            ],
          ),
          StatefulShellBranch(
            routes: [
              GoRoute(
                path: '/more',
                name: 'more',
                pageBuilder: (context, state) => const NoTransitionPage<void>(
                  child: MoreScreen(),
                ),
              ),
            ],
          ),
        ],
      ),
    ],
  );
}
