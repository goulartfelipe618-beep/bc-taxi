import 'package:flutter/material.dart';

class AppTheme {
  static const Color black = Color(0xFF000000);
  static const Color white = Color(0xFFFFFFFF);
  static const Color gray100 = Color(0xFFF3F3F3);
  static const Color gray200 = Color(0xFFE8E8E8);
  static const Color gray400 = Color(0xFF6B6B6B);
  static const Color darkBg = Color(0xFF121212);
  static const Color darkCard = Color(0xFF1E1E1E);
  static const Color darkBorder = Color(0xFF333333);
  static const Color accent = Color(0xFF276EF1);
  static const Color primary = black;
  static const Color primaryDark = black;
  static const Color darkColor = black;
  static const Color background = white;
  static const Color textSecondary = gray400;
  static const Color error = Color(0xFFE53935);
  static const Color success = Color(0xFF05944F);

  static ThemeData get light => _buildTheme(
        brightness: Brightness.light,
        scaffold: white,
        surface: white,
        card: gray100,
        text: black,
        onPrimary: white,
        buttonBg: black,
        border: gray200,
      );

  static ThemeData get darkTheme => _buildTheme(
        brightness: Brightness.dark,
        scaffold: darkBg,
        surface: darkCard,
        card: darkCard,
        text: white,
        onPrimary: black,
        buttonBg: white,
        border: darkBorder,
      );

  static ThemeData _buildTheme({
    required Brightness brightness,
    required Color scaffold,
    required Color surface,
    required Color card,
    required Color text,
    required Color onPrimary,
    required Color buttonBg,
    required Color border,
  }) {
    return ThemeData(
      useMaterial3: true,
      brightness: brightness,
      scaffoldBackgroundColor: scaffold,
      colorScheme: ColorScheme(
        brightness: brightness,
        primary: buttonBg,
        onPrimary: onPrimary,
        secondary: accent,
        onSecondary: white,
        error: error,
        onError: white,
        surface: surface,
        onSurface: text,
      ),
      appBarTheme: AppBarTheme(
        backgroundColor: scaffold,
        foregroundColor: text,
        elevation: 0,
        centerTitle: true,
      ),
      cardColor: card,
      dividerColor: border,
      elevatedButtonTheme: ElevatedButtonThemeData(
        style: ElevatedButton.styleFrom(
          backgroundColor: buttonBg,
          foregroundColor: onPrimary,
          minimumSize: const Size(double.infinity, 52),
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
          textStyle: const TextStyle(fontSize: 16, fontWeight: FontWeight.w700),
        ),
      ),
      inputDecorationTheme: InputDecorationTheme(
        filled: true,
        fillColor: surface,
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
          borderSide: BorderSide(color: border),
        ),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
          borderSide: BorderSide(color: border),
        ),
        contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
      ),
      navigationBarTheme: NavigationBarThemeData(
        backgroundColor: surface,
        indicatorColor: card,
        labelTextStyle: WidgetStateProperty.all(TextStyle(fontWeight: FontWeight.w600, color: text)),
      ),
    );
  }

  static const Map<String, String> vehicleLabels = {
    'economy': 'BC X',
    'comfort': 'Conforto',
    'premium': 'Premium',
    'wait': 'Espere e poupe',
    'moto': 'Moto',
  };

  static const Map<String, String> tripStatusLabels = {
    'requested': 'Aguardando motorista',
    'accepted': 'Motorista a caminho',
    'driver_arrived': 'Motorista chegou',
    'in_progress': 'Em viagem',
    'completed': 'Finalizada',
    'cancelled': 'Cancelada',
  };
}
