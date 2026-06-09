import 'dart:ui';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../design/app_colors.dart';
import '../../design/app_radius.dart';
import '../../design/app_spacing.dart';
import '../../l10n/app_strings.dart';

class GlassBottomBar extends ConsumerWidget {
  const GlassBottomBar({
    super.key,
    required this.currentIndex,
    required this.onTap,
  });

  final int currentIndex;
  final ValueChanged<int> onTap;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final s = S(ref.watch(appLocaleProvider));
    final items = <_NavItem>[
      _NavItem(Icons.check_circle_outline, Icons.check_circle, s.todo),
      _NavItem(Icons.calendar_month_outlined, Icons.calendar_month, s.calendar),
      _NavItem(Icons.auto_awesome_outlined, Icons.auto_awesome, s.habits),
      _NavItem(Icons.history, Icons.history, s.log),
      _NavItem(Icons.menu, Icons.menu, s.more),
    ];
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final base = AppColors.surface.withValues(alpha: 0.82);
    final border = (isDark ? AppColors.zinc800 : AppColors.zinc200)
        .withValues(alpha: 0.7);

    return ClipRRect(
      borderRadius: const BorderRadius.vertical(
        top: Radius.circular(AppRadius.xl),
      ),
      child: BackdropFilter(
        filter: ImageFilter.blur(sigmaX: 20, sigmaY: 20),
        child: DecoratedBox(
          decoration: BoxDecoration(
            color: isDark
                ? AppColors.zinc950.withValues(alpha: 0.85)
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
                AppSpacing.xs,
                AppSpacing.sm,
                AppSpacing.xs,
              ),
              child: Row(
                mainAxisAlignment: MainAxisAlignment.spaceAround,
                children: List.generate(items.length, (i) {
                  final item = items[i];
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
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final fg = selected
        ? (isDark ? AppColors.accent300 : AppColors.accent700)
        : Theme.of(context).colorScheme.onSurfaceVariant;
    final selectedBg = isDark
        ? AppColors.accent500.withValues(alpha: 0.16)
        : AppColors.accent50;

    return Material(
      color: selected ? selectedBg : Colors.transparent,
      borderRadius: BorderRadius.circular(AppRadius.md),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(AppRadius.md),
        child: Padding(
          padding: const EdgeInsets.symmetric(
            horizontal: AppSpacing.md,
            vertical: AppSpacing.xs,
          ),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(
                selected ? item.filled : item.outlined,
                size: 22,
                color: fg,
              ),
              const SizedBox(height: 2),
              Text(
                item.label,
                style: Theme.of(context).textTheme.labelSmall?.copyWith(
                      fontSize: 11,
                      fontWeight: FontWeight.w700,
                      letterSpacing: 0.2,
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
