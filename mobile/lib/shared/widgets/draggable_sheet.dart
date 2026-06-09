import 'package:flutter/material.dart';

import '../../design/app_radius.dart';

/// 初期高さ [initialChildSize]（画面比率）から始まり、ユーザーが引き上げできるボトムシート。
Future<T?> showDraggableBottomSheet<T>({
  required BuildContext context,
  required Widget Function(BuildContext context, ScrollController scrollController)
      builder,
  double initialChildSize = 0.5,
  double minChildSize = 0.35,
  double maxChildSize = 0.92,
  bool isDismissible = true,
}) {
  return showModalBottomSheet<T>(
    context: context,
    isScrollControlled: true,
    useSafeArea: true,
    isDismissible: isDismissible,
    enableDrag: true,
    backgroundColor: Colors.transparent,
    builder: (ctx) {
      return DraggableScrollableSheet(
        initialChildSize: initialChildSize,
        minChildSize: minChildSize,
        maxChildSize: maxChildSize,
        expand: false,
        snap: true,
        snapSizes: [minChildSize, initialChildSize, maxChildSize],
        builder: (context, scrollController) {
          final cs = Theme.of(context).colorScheme;
          return Container(
            decoration: BoxDecoration(
              color: cs.surface,
              borderRadius: const BorderRadius.vertical(
                top: Radius.circular(AppRadius.xl),
              ),
            ),
            child: Column(
              children: [
                const _SheetDragHandle(),
                Expanded(child: builder(context, scrollController)),
              ],
            ),
          );
        },
      );
    },
  );
}

class _SheetDragHandle extends StatelessWidget {
  const _SheetDragHandle();

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(top: 12, bottom: 8),
      child: Center(
        child: Container(
          width: 40,
          height: 4,
          decoration: BoxDecoration(
            color: Theme.of(context).colorScheme.outlineVariant,
            borderRadius: BorderRadius.circular(999),
          ),
        ),
      ),
    );
  }
}
