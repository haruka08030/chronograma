import 'package:flutter/material.dart';

import '../../design/app_colors.dart';

/// Circular gradient FAB (Kinetic primary → primary-container).
class KineticGradientFab extends StatelessWidget {
  const KineticGradientFab({
    super.key,
    required this.onPressed,
    this.bottomInset = 112,
    this.size = 56,
    this.icon = Icons.add,
  });

  final VoidCallback onPressed;
  final double bottomInset;
  final double size;
  final IconData icon;

  @override
  Widget build(BuildContext context) {
    return Positioned(
      right: 24,
      bottom: bottomInset,
      child: Material(
        elevation: 8,
        shadowColor: AppColors.primary.withValues(alpha: 0.35),
        color: Colors.transparent,
        shape: const CircleBorder(),
        clipBehavior: Clip.antiAlias,
        child: InkWell(
          customBorder: const CircleBorder(),
          onTap: onPressed,
          child: Ink(
            width: size,
            height: size,
            decoration: const BoxDecoration(
              shape: BoxShape.circle,
              gradient: LinearGradient(
                begin: Alignment.topLeft,
                end: Alignment.bottomRight,
                colors: [
                  AppColors.accent500,
                  AppColors.accent600,
                ],
              ),
            ),
            child: Icon(
              icon,
              color: AppColors.onPrimary,
              size: size * 0.5,
            ),
          ),
        ),
      ),
    );
  }
}
