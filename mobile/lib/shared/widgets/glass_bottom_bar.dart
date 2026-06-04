import 'dart:ui';

import 'package:flutter/material.dart';

import '../../design/app_radius.dart';
import '../../design/app_spacing.dart';

class GlassBottomBar extends StatelessWidget {
  const GlassBottomBar({
    super.key,
    required this.currentIndex,
    required this.onTap,
  });

  final int currentIndex;
  final ValueChanged<int> onTap;

  static const _items = <_NavItem>[
    _NavItem(Icons.check_circle_outline, Icons.check_circle, 'To-Do'),
    _NavItem(Icons.calendar_month_outlined, Icons.calendar_month, 'Calendar'),
    _NavItem(Icons.auto_awesome_outlined, Icons.auto_awesome, 'Habits'),
    _NavItem(Icons.history, Icons.history, 'Log'),
    _NavItem(Icons.menu, Icons.menu, 'More'),
  ];

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final base = cs.surface.withValues(alpha: 0.78);
    final border = cs.outline.withValues(alpha: 0.12);

    return ClipRRect(
      borderRadius: const BorderRadius.vertical(
        top: Radius.circular(AppRadius.xl),
      ),
      child: BackdropFilter(
        filter: ImageFilter.blur(sigmaX: 20, sigmaY: 20),
        child: DecoratedBox(
          decoration: BoxDecoration(
            color: isDark
                ? const Color(0xFF09090B).withValues(alpha: 0.82)
                : base,
            border: Border(top: BorderSide(color: border)),
            boxShadow: [
              BoxShadow(
                color: Colors.black.withValues(alpha: isDark ? 0.25 : 0.05),
                blurRadius: 20,
                offset: const Offset(0, -4),
              ),
            ],
          ),
          child: SafeArea(
            top: false,
            child: Padding(
              padding: const EdgeInsets.fromLTRB(
                AppSpacing.sm,
                AppSpacing.md,
                AppSpacing.sm,
                AppSpacing.lg,
              ),
              child: Row(
                mainAxisAlignment: MainAxisAlignment.spaceAround,
                children: List.generate(_items.length, (i) {
                  final item = _items[i];
                  final selected = i == currentIndex;
                  return _NavButton(
                    item: item,
                    selected: selected,
                    onTap: () => onTap(i),
                  );
                }),
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class _NavItem {
  const _NavItem(this.outlined, this.filled, this.label);
  final IconData outlined;
  final IconData filled;
  final String label;
}

class _NavButton extends StatelessWidget {
  const _NavButton({
    required this.item,
    required this.selected,
    required this.onTap,
  });

  final _NavItem item;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    final fg = selected ? cs.primary : cs.onSurfaceVariant;

    return Material(
      color: selected
          ? cs.primary.withValues(alpha: 0.12)
          : Colors.transparent,
      borderRadius: BorderRadius.circular(AppRadius.md),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(AppRadius.md),
        child: Padding(
          padding: const EdgeInsets.symmetric(
            horizontal: AppSpacing.md,
            vertical: AppSpacing.sm,
          ),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(
                selected ? item.filled : item.outlined,
                size: 24,
                color: fg,
              ),
              const SizedBox(height: 4),
              Text(
                item.label.toUpperCase(),
                style: Theme.of(context).textTheme.labelSmall?.copyWith(
                      fontSize: 10,
                      fontWeight: FontWeight.w800,
                      letterSpacing: 1.2,
                      color: fg,
                    ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
