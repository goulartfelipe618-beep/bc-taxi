import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../providers/auth_provider.dart';
import 'home/home_screen.dart';
import 'rides/rides_screen.dart';
import 'driver/driver_screen.dart';
import 'profile/profile_screen.dart';

class MainShell extends StatefulWidget {
  const MainShell({super.key});

  @override
  State<MainShell> createState() => _MainShellState();
}

class _MainShellState extends State<MainShell> {
  int _index = 0;

  @override
  Widget build(BuildContext context) {
    final user = context.watch<AuthProvider>().user;
    final isDriver = user?.isDriver ?? false;

    final screens = [
      const HomeScreen(),
      const RidesScreen(),
      if (isDriver) const DriverScreen(),
      const ProfileScreen(),
    ];

    final destinations = [
      const NavigationDestination(icon: Icon(Icons.map), label: 'Início'),
      const NavigationDestination(icon: Icon(Icons.history), label: 'Corridas'),
      if (isDriver)
        const NavigationDestination(icon: Icon(Icons.directions_car), label: 'Motorista'),
      const NavigationDestination(icon: Icon(Icons.person), label: 'Perfil'),
    ];

    return Scaffold(
      body: IndexedStack(index: _index, children: screens),
      bottomNavigationBar: NavigationBar(
        selectedIndex: _index,
        onDestinationSelected: (i) => setState(() => _index = i),
        destinations: destinations,
      ),
    );
  }
}
