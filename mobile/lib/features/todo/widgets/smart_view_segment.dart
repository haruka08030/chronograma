import 'package:flutter/material.dart';

import '../../../design/app_radius.dart';
import '../../../design/app_spacing.dart';
import '../models/smart_view.dart';

class SmartViewSegment extends StatelessWidget {
  const SmartViewSegment({
    super.key,
    required this.value,
    required this.onChanged,
  });

  final SmartView value;
  final ValueChanged<SmartView> onChanged;

  static const _views = SmartView.values;

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;

    return SingleChildScrollView(
      scrollDirection: Axis.horizontal,
      child: DecoratedBox(
        decoration: BoxDecoration(
          color: cs.surfaceContainerLow,
          borderRadius: BorderRadius.circular(AppRadius.md),
        ),
        child: Padding(
          padding: const EdgeInsets.all(4),
          child: Row(
            children: [
              for (final v in _views) ...[
                _Chip(
                  label: v.label,
                  selected: value == v,
                  onTap: () => onChanged(v),
                ),
                if (v != _views.last) const SizedBox(width: 4),
              ],
            ],
          ),
        ),
      ),
    );
  }
}

class _Chip extends StatelessWidget {
  const _Chip({
    required this.label,
    required this.selected,
    required this.onTap,
  });

  final String label;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    return Material(
      color: selected ? cs.surfaceContainerLowest : Colors.transparent,
      borderRadius: BorderRadius.circular(AppRadius.sm),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(AppRadius.sm),
        child: Padding(
          padding: const EdgeInsets.symmetric(
            horizontal: AppSpacing.md,
            vertical: AppSpacing.sm,
          ),
          child: Text(
            label,
            style: Theme.of(context).textTheme.labelLarge?.copyWith(
                  fontSize: 13,
                  fontWeight: selected ? FontWeight.w600 : FontWeight.w500,
                  color: selected ? cs.primary : cs.onSurfaceVariant,
                ),
          ),
        ),
      ),
    );
  }
}
