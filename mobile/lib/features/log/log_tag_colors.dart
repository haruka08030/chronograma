import 'package:flutter/material.dart';

/// Pastel accents aligned with Web [tagColors.ts] `TAG_COLORS` order (solid for Flutter).
const List<Color> logTagAccentColors = [
  Color(0xFF2563EB),
  Color(0xFF059669),
  Color(0xFF9333EA),
  Color(0xFFD97706),
  Color(0xFFDB2777),
  Color(0xFF0891B2),
];

Color logAccentColorForTags(List<String> tags, Brightness brightness) {
  if (tags.isEmpty) {
    return brightness == Brightness.dark
        ? const Color(0xFF34D399)
        : const Color(0xFF059669);
  }
  final idx = tags.first.hashCode.abs() % logTagAccentColors.length;
  return logTagAccentColors[idx];
}
