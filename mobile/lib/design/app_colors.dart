import 'package:flutter/material.dart';

/// Chronograma tokens aligned with Web Tailwind (accent/zinc + Inter).
abstract final class AppColors {
  // Web accent scale (src/index.css --color-accent-*)
  static const Color accent50 = Color(0xFFEEF2FF);
  static const Color accent100 = Color(0xFFE0E7FF);
  static const Color accent200 = Color(0xFFC7D2FE);
  static const Color accent300 = Color(0xFFA5B4FC);
  static const Color accent400 = Color(0xFF818CF8);
  static const Color accent500 = Color(0xFF6366F1);
  static const Color accent600 = Color(0xFF4F46E5);
  static const Color accent700 = Color(0xFF4338CA);

  // Web zinc scale (Tailwind)
  static const Color zinc50 = Color(0xFFFAFAFA);
  static const Color zinc100 = Color(0xFFF4F4F5);
  static const Color zinc200 = Color(0xFFE4E4E7);
  static const Color zinc300 = Color(0xFFD4D4D8);
  static const Color zinc400 = Color(0xFFA1A1AA);
  static const Color zinc500 = Color(0xFF71717A);
  static const Color zinc600 = Color(0xFF52525B);
  static const Color zinc700 = Color(0xFF3F3F46);
  static const Color zinc800 = Color(0xFF27272A);
  static const Color zinc900 = Color(0xFF18181B);
  static const Color zinc950 = Color(0xFF09090B);

  // Primary = Web accent-500 / accent-600
  static const Color primary = accent500;
  static const Color primaryContainer = accent600;
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

  // Light surfaces aligned with Web zinc neutrals
  static const Color background = Color(0xFFFFFFFF);
  static const Color surface = Color(0xFFFFFFFF);
  static const Color surfaceBright = Color(0xFFFFFFFF);
  static const Color surfaceContainer = zinc100;
  static const Color surfaceContainerHigh = zinc200;
  static const Color surfaceContainerHighest = zinc200;
  static const Color surfaceContainerLow = zinc50;
  static const Color surfaceContainerLowest = Color(0xFFFFFFFF);
  static const Color surfaceVariant = zinc100;

  static const Color onBackground = zinc900;
  static const Color onSurface = zinc900;
  static const Color onSurfaceVariant = zinc500;
  static const Color outline = zinc300;
  static const Color outlineVariant = zinc200;

  static const Color inverseSurface = Color(0xFF2F3038);
  static const Color inverseOnSurface = Color(0xFFF1EFFA);
  static const Color inversePrimary = Color(0xFFC0C1FF);

  // Dark zinc-aligned surfaces (Web dark mode)
  static const Color darkBackground = zinc950;
  static const Color darkSurface = zinc900;
  static const Color darkSurfaceContainer = zinc800;
  static const Color darkSurfaceContainerHigh = zinc700;
  static const Color darkSurfaceContainerHighest = zinc600;
  static const Color darkSurfaceContainerLow = Color(0xFF1C1C1F);
  static const Color darkSurfaceContainerLowest = zinc800;
  static const Color darkOnSurface = zinc100;
  static const Color darkOnSurfaceVariant = zinc400;
  static const Color darkOutline = zinc700;
  static const Color darkPrimary = accent400;
  static const Color darkPrimaryContainer = accent500;

  // Priority dot colors (match Web TaskItem.tsx)
  static const Color priorityHigh = Color(0xFFEF4444); // red-500
  static const Color priorityMedium = Color(0xFFF59E0B); // amber-500
  static const Color priorityLow = Color(0xFF3B82F6); // blue-500
}
