enum AppRole { passenger, driver }

class AppConfig {
  const AppConfig({required this.role, required this.title, required this.tokenKey});

  final AppRole role;
  final String title;
  final String tokenKey;

  String get roleValue => role == AppRole.driver ? 'driver' : 'passenger';
  String get roleLabel => role == AppRole.driver ? 'Motorista' : 'Passageiro';
  bool get isDriver => role == AppRole.driver;

  static const passenger = AppConfig(
    role: AppRole.passenger,
    title: 'BC Taxi Passageiro',
    tokenKey: 'bc_taxi_passenger_token',
  );

  static const driver = AppConfig(
    role: AppRole.driver,
    title: 'BC Taxi Motorista',
    tokenKey: 'bc_taxi_driver_token',
  );
}
