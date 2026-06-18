import 'dart:convert';

import 'package:flutter/foundation.dart';
import 'package:http/http.dart' as http;
import 'package:shared_preferences/shared_preferences.dart';

import '../config/api_config.dart';
import '../config/app_config.dart';
import '../models/user.dart';

class AuthService extends ChangeNotifier {
  AuthService(this.appConfig);

  final AppConfig appConfig;

  AppUser? _user;
  String? _token;
  bool _loading = true;
  String? _error;

  AppUser? get user => _user;
  bool get loading => _loading;
  String? get error => _error;
  bool get isLoggedIn => _user != null;

  Future<void> init() async {
    _loading = true;
    notifyListeners();
    try {
      final prefs = await SharedPreferences.getInstance();
      _token = prefs.getString(appConfig.tokenKey);
      if (_token != null) {
        _user = await _getMe(_token!);
        if (_user!.role != appConfig.roleValue) await _clearToken();
      }
    } catch (_) {
      await _clearToken();
    } finally {
      _loading = false;
      notifyListeners();
    }
  }

  Future<bool> login(String email, String password) async {
    _error = null;
    notifyListeners();
    try {
      final response = await http.post(
        Uri.parse('$apiBaseUrl/auth/login'),
        headers: {'Content-Type': 'application/json'},
        body: jsonEncode({'email': email.trim(), 'password': password}),
      );
      final data = jsonDecode(response.body) as Map<String, dynamic>;
      if (response.statusCode != 200) {
        _error = data['error'] as String? ?? 'Erro ao entrar';
        notifyListeners();
        return false;
      }
      final userJson = data['user'] as Map<String, dynamic>;
      if (userJson['role'] != appConfig.roleValue) {
        _error = appConfig.isDriver
            ? 'Esta conta não é de motorista. Use o app BC Taxi Passageiro.'
            : 'Esta conta não é de passageiro. Use o app BC Taxi Motorista.';
        notifyListeners();
        return false;
      }
      await _saveSession(data['token'] as String, userJson);
      return true;
    } catch (_) {
      _error = 'Não foi possível conectar à API em $apiBaseUrl';
      notifyListeners();
      return false;
    }
  }

  Future<bool> register({required String email, required String password, required String fullName}) async {
    _error = null;
    notifyListeners();
    try {
      final response = await http.post(
        Uri.parse('$apiBaseUrl/auth/register'),
        headers: {'Content-Type': 'application/json'},
        body: jsonEncode({
          'email': email.trim(),
          'password': password,
          'fullName': fullName.trim(),
          'role': appConfig.roleValue,
        }),
      );
      final data = jsonDecode(response.body) as Map<String, dynamic>;
      if (response.statusCode != 201) {
        _error = data['error'] as String? ?? 'Erro ao criar conta';
        notifyListeners();
        return false;
      }
      await _saveSession(data['token'] as String, data['user'] as Map<String, dynamic>);
      return true;
    } catch (_) {
      _error = 'Não foi possível conectar à API em $apiBaseUrl';
      notifyListeners();
      return false;
    }
  }

  Future<void> logout() async {
    await _clearToken();
    notifyListeners();
  }

  void clearError() {
    _error = null;
    notifyListeners();
  }

  Future<void> _saveSession(String token, Map<String, dynamic> userJson) async {
    _token = token;
    _user = AppUser.fromJson(userJson);
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(appConfig.tokenKey, token);
    notifyListeners();
  }

  Future<void> _clearToken() async {
    _token = null;
    _user = null;
    final prefs = await SharedPreferences.getInstance();
    await prefs.remove(appConfig.tokenKey);
  }

  Future<AppUser> _getMe(String token) async {
    final response = await http.get(
      Uri.parse('$apiBaseUrl/auth/me'),
      headers: {'Authorization': 'Bearer $token'},
    );
    final data = jsonDecode(response.body) as Map<String, dynamic>;
    if (response.statusCode != 200) throw Exception(data['error'] ?? 'Sessão inválida');
    return AppUser.fromJson(data['user'] as Map<String, dynamic>);
  }
}
