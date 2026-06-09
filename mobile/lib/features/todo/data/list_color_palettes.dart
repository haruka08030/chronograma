import 'dart:math' as math;

import 'package:flutter/material.dart';

/// `#RRGGBB` / `#AARRGGBB` -> [Color]。無効値は accent 既定。
Color hexToColor(String hex) {
  var h = hex.replaceAll('#', '').trim();
  if (h.length == 6) h = 'FF$h';
  if (h.length != 8) return const Color(0xFF6366F1);
  return Color(int.tryParse(h, radix: 16) ?? 0xFF6366F1);
}

/// Web `src/lib/listColorPalettes.ts` の Dart 移植。リスト／習慣の色チップ。
class ListColorPalette {
  const ListColorPalette({required this.id, required this.colors});
  final String id;
  final List<String> colors;
}

const List<int> _hues10 = [0, 36, 72, 108, 144, 180, 216, 252, 288, 324];
const List<int> _coolHues = [188, 198, 208, 218, 228, 238, 248, 258, 268, 278];

String _hslToHex(double h, double s, double l) {
  final lightness = l / 100;
  final a = (s / 100) * math.min(lightness, 1 - lightness);
  String f(int n) {
    final k = (n + h / 30) % 12;
    final color = lightness - a * math.max(math.min(math.min(k - 3, 9 - k), 1.0), -1.0);
    final v = (255 * color).round().clamp(0, 255);
    return v.toRadixString(16).padLeft(2, '0');
  }

  return '#${f(0)}${f(8)}${f(4)}';
}

List<String> _spectrumPastel(double s, double l) =>
    _hues10.map((h) => _hslToHex(h.toDouble(), s, l)).toList();

final List<String> _monoSteps = List.generate(
  10,
  (i) => _hslToHex(226, 12 + i * 1.8, 84 - i * 4.2),
);

final List<ListColorPalette> listColorPalettes = [
  ListColorPalette(id: 'pastel-rainbow', colors: _spectrumPastel(42, 81)),
  ListColorPalette(id: 'tint-rainbow', colors: _spectrumPastel(32, 90)),
  ListColorPalette(id: 'candy-soft', colors: _spectrumPastel(52, 74)),
  ListColorPalette(id: 'neon-mute', colors: _spectrumPastel(48, 66)),
  ListColorPalette(
    id: 'cool-pastel',
    colors: _coolHues.map((h) => _hslToHex(h.toDouble(), 36, 83)).toList(),
  ),
  ListColorPalette(id: 'mono-hue', colors: _monoSteps),
];

const String defaultListColorPaletteId = 'pastel-rainbow';

List<String> paletteColors(String paletteId) {
  return listColorPalettes
      .firstWhere(
        (p) => p.id == paletteId,
        orElse: () => listColorPalettes.first,
      )
      .colors;
}

bool isValidListColorPaletteId(String id) =>
    listColorPalettes.any((p) => p.id == id);
