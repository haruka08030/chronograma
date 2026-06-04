import 'package:flutter/material.dart';

/// Kinetic Workspace / Chronograma indigo tokens (light + dark).
abstract final class AppColors {
  // Primary indigo
  static const Color primary = Color(0xFF4648D4);
  static const Color primaryContainer = Color(0xFF6063EE);
  static const Color onPrimary = Color(0xFFFFFFFF);
  static const Color onPrimaryContainer = Color(0xFFFFFBFF);

  static const Color secondary = Color(0xFF575992);
  static const Color secondaryContainer = Color(0xFFBDBEFE);
  static const Color onSecondaryContainer = Color(0xFF494B83);

  static const Color tertiary = Color(0xFF904900);
  static const Color tertiaryContainer = Color(0xFFB55D00);

  static const Color error = Color(0xFFBA1A1A);
  static const Color errorContainer = Color(0xFFFFDAD6);
  static const Color onError = Color(0xFFFFFFFF);
  static const Color onErrorContainer = Color(0xFF93000A);

  // Light surfaces (from stitch tailwind theme)
  static const Color background = Color(0xFFFBF8FF);
  static const Color surface = Color(0xFFFBF8FF);
  static const Color surfaceBright = Color(0xFFFBF8FF);
  static const Color surfaceContainer = Color(0xFFEEEDF7);
  static const Color surfaceContainerHigh = Color(0xFFE8E7F1);
  static const Color surfaceContainerHighest = Color(0xFFE3E1EC);
  static const Color surfaceContainerLow = Color(0xFFF4F2FD);
  static const Color surfaceContainerLowest = Color(0xFFFFFFFF);
  static const Color surfaceVariant = Color(0xFFE3E1EC);

  static const Color onBackground = Color(0xFF1A1B22);
  static const Color onSurface = Color(0xFF1A1B22);
  static const Color onSurfaceVariant = Color(0xFF464554);
  static const Color outline = Color(0xFF767586);
  static const Color outlineVariant = Color(0xFFC7C4D7);

  static const Color inverseSurface = Color(0xFF2F3038);
  static const Color inverseOnSurface = Color(0xFFF1EFFA);
  static const Color inversePrimary = Color(0xFFC0C1FF);

  // Dark zinc-aligned surfaces
  static const Color darkBackground = Color(0xFF09090B);
  static const Color darkSurface = Color(0xFF18181B);
  static const Color darkSurfaceContainer = Color(0xFF27272A);
  static const Color darkSurfaceContainerHigh = Color(0xFF3F3F46);
  static const Color darkSurfaceContainerHighest = Color(0xFF52525B);
  static const Color darkSurfaceContainerLow = Color(0xFF1C1C1F);
  static const Color darkSurfaceContainerLowest = Color(0xFF27272A);
  static const Color darkOnSurface = Color(0xFFF4F4F5);
  static const Color darkOnSurfaceVariant = Color(0xFFA1A1AA);
  static const Color darkOutline = Color(0xFF71717A);
  static const Color darkPrimary = Color(0xFF818CF8);
  static const Color darkPrimaryContainer = Color(0xFF6366F1);
}
