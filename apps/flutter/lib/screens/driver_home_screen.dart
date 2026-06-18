import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../services/auth_service.dart';
import 'login_screen.dart';

class DriverHomeScreen extends StatefulWidget {
  const DriverHomeScreen({super.key});

  @override
  State<DriverHomeScreen> createState() => _DriverHomeScreenState();
}

class _DriverHomeScreenState extends State<DriverHomeScreen> {
  int _tab = 0;
  bool _online = false;

  Future<void> _logout() async {
    await context.read<AuthService>().logout();
    if (!mounted) return;
    Navigator.of(context).pushAndRemoveUntil(MaterialPageRoute(builder: (_) => const LoginScreen()), (_) => false);
  }

  @override
  Widget build(BuildContext context) {
    final user = context.watch<AuthService>().user!;
    final firstName = user.fullName.split(' ').first;

    return Scaffold(
      appBar: AppBar(
        title: const Text('BC Taxi Motorista'),
        actions: [IconButton(icon: const Icon(Icons.logout), onPressed: _logout)],
      ),
      body: IndexedStack(
        index: _tab,
        children: [
          ListView(
            padding: const EdgeInsets.all(16),
            children: [
              Row(
                children: [
                  Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    Text('Olá, $firstName', style: const TextStyle(fontSize: 24, fontWeight: FontWeight.w800)),
                    Text(_online ? 'Você está online' : 'Fique online para receber corridas', style: TextStyle(color: Colors.grey[600])),
                  ])),
                  FilledButton(
                    onPressed: () => setState(() => _online = !_online),
                    style: FilledButton.styleFrom(backgroundColor: _online ? Colors.green : Colors.grey.shade200, foregroundColor: _online ? Colors.white : Colors.black),
                    child: Text(_online ? 'Online' : 'Offline'),
                  ),
                ],
              ),
              const SizedBox(height: 16),
              Container(
                height: 140,
                decoration: BoxDecoration(color: Colors.grey.shade200, borderRadius: BorderRadius.circular(16)),
                child: Center(child: Text(_online ? 'Aguardando solicitações…' : 'Ative o modo online')),
              ),
            ],
          ),
          const Center(child: Text('Corridas')),
          const Center(child: Text('Ganhos')),
          Padding(
            padding: const EdgeInsets.all(24),
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              const Text('Minha conta', style: TextStyle(fontSize: 28, fontWeight: FontWeight.w800)),
              Text(user.email, style: TextStyle(color: Colors.grey[600])),
              const Chip(label: Text('Motorista')),
            ]),
          ),
        ],
      ),
      bottomNavigationBar: NavigationBar(
        selectedIndex: _tab,
        onDestinationSelected: (i) => setState(() => _tab = i),
        destinations: const [
          NavigationDestination(icon: Icon(Icons.home_outlined), selectedIcon: Icon(Icons.home), label: 'Início'),
          NavigationDestination(icon: Icon(Icons.directions_car_outlined), selectedIcon: Icon(Icons.directions_car), label: 'Corridas'),
          NavigationDestination(icon: Icon(Icons.payments_outlined), selectedIcon: Icon(Icons.payments), label: 'Ganhos'),
          NavigationDestination(icon: Icon(Icons.person_outline), selectedIcon: Icon(Icons.person), label: 'Conta'),
        ],
      ),
    );
  }
}
