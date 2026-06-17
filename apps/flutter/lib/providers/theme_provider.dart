import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';

enum ThemePreference { light, dark, system }

class ThemeProvider extends ChangeNotifier {
  static const _storageKey = 'bc_taxi_theme_preference';

  ThemePreference _preference = ThemePreference.system;
  ThemeMode _themeMode = ThemeMode.system;

  ThemePreference get preference => _preference;
  ThemeMode get themeMode => _themeMode;

  bool get isDark => _themeMode == ThemeMode.dark;

  Future<void> load() async {
    final prefs = await SharedPreferences.getInstance();
    final stored = prefs.getString(_storageKey);
    if (stored != null) {
      _preference = ThemePreference.values.firstWhere(
        (p) => p.name == stored,
        orElse: () => ThemePreference.system,
      );
      _applyPreference();
    }
  }

  Future<void> setPreference(ThemePreference preference) async {
    _preference = preference;
    _applyPreference();
    notifyListeners();
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(_storageKey, preference.name);
  }

  void _applyPreference() {
    _themeMode = switch (_preference) {
      ThemePreference.light => ThemeMode.light,
      ThemePreference.dark => ThemeMode.dark,
      ThemePreference.system => ThemeMode.system,
    };
  }

  Future<void> toggleLightDark() async {
    final next = isDark ? ThemePreference.light : ThemePreference.dark;
    await setPreference(next);
  }
}
