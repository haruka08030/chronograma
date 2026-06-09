import 'package:flutter/material.dart';

import '../../design/app_colors.dart';
import '../../design/app_radius.dart';
import '../../design/app_spacing.dart';

/// Screen header: brand wordmark (accent) + optional title and trailing action.
/// Mirrors Web sidebar brand + view title.
class ChronogramaScreenHeader extends StatelessWidget {
  const ChronogramaScreenHeader({
    super.key,
    this.title,
    this.trailing,
  });

  final String? title;
  final Widget? trailing;

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final brandColor = isDark ? AppColors.accent400 : AppColors.accent600;
    final Widget? titleWidget = (title != null && title!.isNotEmpty)
        ? Text(title!, style: Theme.of(context).textTheme.displaySmall)
        : null;
    return Padding(
      padding: const EdgeInsets.only(bottom: AppSpacing.sm),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.center,
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'Chronograma',
                  style: Theme.of(context).textTheme.titleLarge?.copyWith(
                        color: brandColor,
                        fontWeight: FontWeight.w900,
                        letterSpacing: -0.5,
                      ),
                ),
                ?titleWidget,
              ],
            ),
          ),
          ?trailing,
        ],
      ),
    );
  }
}

/// Pill-shaped search field matching Web's rounded-full zinc input.
class ChronogramaSearchBar extends StatelessWidget {
  const ChronogramaSearchBar({
    super.key,
    required this.controller,
    required this.hintText,
    this.onChanged,
    this.onClear,
  });

  final TextEditingController controller;
  final String hintText;
  final ValueChanged<String>? onChanged;
  final VoidCallback? onClear;

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final fill = isDark
        ? AppColors.zinc900.withValues(alpha: 0.6)
        : AppColors.zinc50.withValues(alpha: 0.9);
    final border = isDark ? AppColors.zinc700 : AppColors.zinc200;
    final hasText = controller.text.isNotEmpty;

    return DecoratedBox(
      decoration: BoxDecoration(
        color: fill,
        borderRadius: BorderRadius.circular(999),
        border: Border.all(color: border),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: isDark ? 0.0 : 0.04),
            blurRadius: 2,
            offset: const Offset(0, 1),
          ),
        ],
      ),
      child: TextField(
        controller: controller,
        onChanged: onChanged,
        textInputAction: TextInputAction.search,
        decoration: InputDecoration(
          isDense: true,
          filled: false,
          border: InputBorder.none,
          enabledBorder: InputBorder.none,
          focusedBorder: InputBorder.none,
          hintText: hintText,
          prefixIcon: Icon(
            Icons.search,
            size: 20,
            color: AppColors.zinc400,
          ),
          suffixIcon: hasText
              ? IconButton(
                  icon: Icon(Icons.close, size: 18, color: AppColors.zinc400),
                  onPressed: onClear,
                )
              : null,
          contentPadding: const EdgeInsets.symmetric(
            horizontal: AppSpacing.md,
            vertical: AppSpacing.md,
          ),
        ),
      ),
    );
  }
}

/// Horizontal selectable chips matching Web sidebar list chips.
class ChronogramaFilterChips extends StatelessWidget {
  const ChronogramaFilterChips({
    super.key,
    required this.options,
    required this.selectedId,
    required this.onSelected,
  });

  /// (id, label). id == null means "All".
  final List<(String?, String)> options;
  final String? selectedId;
  final ValueChanged<String?> onSelected;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      height: 40,
      child: ListView.separated(
        scrollDirection: Axis.horizontal,
        itemCount: options.length,
        separatorBuilder: (_, _) => const SizedBox(width: AppSpacing.sm),
        itemBuilder: (context, i) {
          final (id, label) = options[i];
          return ChoiceChip(
            label: Text(label),
            selected: selectedId == id,
            onSelected: (_) => onSelected(id),
          );
        },
      ),
    );
  }
}

/// Empty state with zinc body + hint.
class ChronogramaEmptyState extends StatelessWidget {
  const ChronogramaEmptyState({
    super.key,
    required this.message,
    this.hint,
    this.icon = Icons.check_circle_outline,
  });

  final String message;
  final String? hint;
  final IconData icon;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(AppSpacing.xxl),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(icon, size: 40, color: AppColors.zinc400),
            const SizedBox(height: AppSpacing.md),
            Text(
              message,
              textAlign: TextAlign.center,
              style: Theme.of(context).textTheme.bodyLarge?.copyWith(
                    color: AppColors.zinc500,
                  ),
            ),
            if (hint != null) ...[
              const SizedBox(height: AppSpacing.xs),
              Text(
                hint!,
                textAlign: TextAlign.center,
                style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                      color: AppColors.zinc400,
                    ),
              ),
            ],
          ],
        ),
      ),
    );
  }
}

/// Section heading: small uppercase-ish zinc label (Web `text-xs text-zinc-500`).
class ChronogramaSectionLabel extends StatelessWidget {
  const ChronogramaSectionLabel(this.text, {super.key});

  final String text;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: AppSpacing.sm),
      child: Text(
        text,
        style: Theme.of(context).textTheme.labelLarge?.copyWith(
              color: AppColors.zinc500,
              fontWeight: FontWeight.w600,
              fontSize: 12,
            ),
      ),
    );
  }
}

/// Card wrapper with Web-aligned border + radius.
class ChronogramaCard extends StatelessWidget {
  const ChronogramaCard({super.key, required this.child, this.padding});

  final Widget child;
  final EdgeInsetsGeometry? padding;

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    return Container(
      padding: padding ?? const EdgeInsets.all(AppSpacing.md),
      decoration: BoxDecoration(
        color: isDark
            ? AppColors.darkSurfaceContainerLowest
            : AppColors.surfaceContainerLowest,
        borderRadius: BorderRadius.circular(AppRadius.md),
        border: Border.all(
          color: isDark ? AppColors.zinc800 : AppColors.zinc200,
        ),
      ),
      child: child,
    );
  }
}
