import 'package:flutter/material.dart';

class AppTheme {
  static const Color primary = Color(0xFFFFC107);
  static const Color primaryDark = Color(0xFFFFA000);
  static const Color dark = Color(0xFF1A1A1A);
  static const Color background = Color(0xFFF5F5F5);
  static const Color textSecondary = Color(0xFF666666);
  static const Color error = Color(0xFFE53935);
  static const Color success = Color(0xFF43A047);

  static ThemeData get light => ThemeData(
        useMaterial3: true,
        colorScheme: ColorScheme.fromSeed(
          seedColor: primary,
          primary: primary,
          surface: Colors.white,
        ),
        scaffoldBackgroundColor: background,
        appBarTheme: const AppBarTheme(
          backgroundColor: dark,
          foregroundColor: Colors.white,
          elevation: 0,
        ),
        elevatedButtonTheme: ElevatedButtonThemeData(
          style: ElevatedButton.styleFrom(
            backgroundColor: primary,
            foregroundColor: dark,
            minimumSize: const Size(double.infinity, 52),
            shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(12),
            ),
            textStyle: const TextStyle(
              fontSize: 16,
              fontWeight: FontWeight.w600,
            ),
          ),
        ),
        inputDecorationTheme: InputDecorationTheme(
          filled: true,
          fillColor: Colors.white,
          border: OutlineInputBorder(
            borderRadius: BorderRadius.circular(12),
            borderSide: const BorderSide(color: Color(0xFFE0E0E0)),
          ),
          enabledBorder: OutlineInputBorder(
            borderRadius: BorderRadius.circular(12),
            borderSide: const BorderSide(color: Color(0xFFE0E0E0)),
          ),
          contentPadding: const EdgeInsets.symmetric(
            horizontal: 16,
            vertical: 14,
          ),
        ),
      );

  static const Map<String, String> vehicleLabels = {
    'economy': 'Econômico',
    'comfort': 'Conforto',
    'premium': 'Premium',
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
