import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import 'config/app_config.dart';
import 'screens/login_screen.dart';
import 'screens/passenger_home_screen.dart';
import 'screens/driver_home_screen.dart';
import 'services/auth_service.dart';
import 'theme/app_theme.dart';

class BcTaxiApp extends StatelessWidget {
  const BcTaxiApp({super.key, required this.appConfig});

  final AppConfig appConfig;

  @override
  Widget build(BuildContext context) {
    return ChangeNotifierProvider(
      create: (_) => AuthService(appConfig)..init(),
      child: MaterialApp(
        title: appConfig.title,
        debugShowCheckedModeBanner: false,
        theme: AppTheme.light,
        home: _RootGate(appConfig: appConfig),
      ),
    );
  }
}

class _RootGate extends StatelessWidget {
  const _RootGate({required this.appConfig});

  final AppConfig appConfig;

  @override
  Widget build(BuildContext context) {
    final auth = context.watch<AuthService>();
    if (auth.loading) return const Scaffold(body: Center(child: CircularProgressIndicator()));
    if (!auth.isLoggedIn) return const LoginScreen();
    return appConfig.isDriver ? const DriverHomeScreen() : const PassengerHomeScreen();
  }
}
