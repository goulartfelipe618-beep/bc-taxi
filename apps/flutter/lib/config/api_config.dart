class ApiConfig {
  // Android emulator: 10.0.2.2 aponta ao localhost da máquina host
  static const String baseUrl = String.fromEnvironment(
    'API_URL',
    defaultValue: 'http://10.0.2.2:3000',
  );

  static String get socketUrl => baseUrl;
}
