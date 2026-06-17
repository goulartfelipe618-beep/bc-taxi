import 'package:flutter/material.dart';

class AppTheme {
  static const Color black = Color(0xFF000000);
  static const Color white = Color(0xFFFFFFFF);
  static const Color gray100 = Color(0xFFF3F3F3);
  static const Color gray200 = Color(0xFFE8E8E8);
  static const Color gray400 = Color(0xFF6B6B6B);
  static const Color accent = Color(0xFF276EF1);
  static const Color primary = black;
  static const Color primaryDark = black;
  static const Color dark = black;
  static const Color background = white;
  static const Color textSecondary = gray400;
  static const Color error = Color(0xFFE53935);
  static const Color success = Color(0xFF05944F);

  static ThemeData get light => ThemeData(
        useMaterial3: true,
        scaffoldBackgroundColor: white,
        colorScheme: const ColorScheme.light(
          primary: black,
          onPrimary: white,
          surface: white,
        ),
        appBarTheme: const AppBarTheme(
          backgroundColor: white,
          foregroundColor: black,
          elevation: 0,
          centerTitle: true,
        ),
        elevatedButtonTheme: ElevatedButtonThemeData(
          style: ElevatedButton.styleFrom(
            backgroundColor: black,
            foregroundColor: white,
            minimumSize: const Size(double.infinity, 52),
            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
            textStyle: const TextStyle(fontSize: 16, fontWeight: FontWeight.w700),
          ),
        ),
        inputDecorationTheme: InputDecorationTheme(
          filled: true,
          fillColor: white,
          border: OutlineInputBorder(
            borderRadius: BorderRadius.circular(12),
            borderSide: const BorderSide(color: gray200),
          ),
          enabledBorder: OutlineInputBorder(
            borderRadius: BorderRadius.circular(12),
            borderSide: const BorderSide(color: gray200),
          ),
          contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
        ),
      );

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
