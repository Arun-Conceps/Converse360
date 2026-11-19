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

/// The one brand gradient for hero cards (Deals summary, More header).
const kBrandGradient = LinearGradient(
  begin: Alignment.topLeft,
  end: Alignment.bottomRight,
  colors: [Color(0xFF0B7A5C), Color(0xFF0E9F76)],
);

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
    // Selected tab: filled icon on a green pill, green bold label. The rest stay
    // muted, so where you are is the only coloured thing in the bar.
    navigationBarTheme: NavigationBarThemeData(
      backgroundColor: C.surface,
      surfaceTintColor: Colors.transparent,
      elevation: 0,
      height: 70,
      indicatorColor: C.accent,
      indicatorShape:
          RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
      labelBehavior: NavigationDestinationLabelBehavior.alwaysShow,
      iconTheme: WidgetStateProperty.resolveWith((s) => IconThemeData(
            size: 23,
            color: s.contains(WidgetState.selected) ? Colors.white : C.muted,
          )),
      labelTextStyle: WidgetStateProperty.resolveWith((s) => TextStyle(
            fontSize: 12,
            fontWeight: s.contains(WidgetState.selected)
                ? FontWeight.w700
                : FontWeight.w500,
            color: s.contains(WidgetState.selected) ? C.accent : C.muted,
          )),
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
