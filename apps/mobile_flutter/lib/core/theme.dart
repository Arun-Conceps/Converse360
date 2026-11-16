import 'package:flutter/material.dart';

/// Tokens lifted from mobile-app-prototype.html (light mode only for v1).
class C {
  static const bg = Color(0xFFF1F4F2);
  static const surface = Color(0xFFFFFFFF);
  static const surface2 = Color(0xFFEAF0ED);
  static const line = Color(0xFFDBE3DF);
  static const fg = Color(0xFF12201A);
  static const muted = Color(0xFF5D6F66);
  static const accent = Color(0xFF0B7A5C);
  static const accentSoft = Color(0xFFD9F0E7);
  static const out = Color(0xFFD4F1E3);
  static const warn = Color(0xFFA15C00);
  static const warnSoft = Color(0xFFFBEAD0);
  static const bad = Color(0xFFB3261E);
  static const badSoft = Color(0xFFF9DEDC);
}

/// Spec section 4: 44pt minimum touch targets.
const double kHit = 44;

ThemeData buildTheme() {
  final scheme = ColorScheme.fromSeed(seedColor: C.accent)
      .copyWith(primary: C.accent, surface: C.surface);
  OutlineInputBorder border() => OutlineInputBorder(
        borderRadius: BorderRadius.circular(10),
        borderSide: const BorderSide(color: C.line),
      );
  return ThemeData(
    useMaterial3: true,
    colorScheme: scheme,
    scaffoldBackgroundColor: C.bg,
    appBarTheme: const AppBarTheme(
      backgroundColor: C.surface,
      foregroundColor: C.fg,
      elevation: 0,
      scrolledUnderElevation: 0,
      surfaceTintColor: Colors.transparent,
      titleTextStyle:
          TextStyle(fontSize: 19, fontWeight: FontWeight.w700, color: C.fg),
    ),
    navigationBarTheme: const NavigationBarThemeData(
      backgroundColor: C.surface,
      indicatorColor: C.accentSoft,
    ),
    inputDecorationTheme: InputDecorationTheme(
      filled: true,
      fillColor: C.surface,
      contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 12),
      border: border(),
      enabledBorder: border(),
    ),
    dividerTheme: const DividerThemeData(color: C.line, space: 1, thickness: 1),
  );
}
