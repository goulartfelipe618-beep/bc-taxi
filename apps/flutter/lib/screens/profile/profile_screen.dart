import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../providers/auth_provider.dart';

class ProfileScreen extends StatelessWidget {
  const ProfileScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final auth = context.watch<AuthProvider>();
    final user = auth.user;

    return Scaffold(
      appBar: AppBar(title: const Text('Perfil')),
      body: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          children: [
            CircleAvatar(
              radius: 40,
              backgroundColor: const Color(0xFFFFC107),
              child: Text(
                user?.fullName.substring(0, 1).toUpperCase() ?? '?',
                style: const TextStyle(
                  fontSize: 32,
                  fontWeight: FontWeight.w700,
                  color: Color(0xFF1A1A1A),
                ),
              ),
            ),
            const SizedBox(height: 12),
            Text(
              user?.fullName ?? '',
              style: const TextStyle(fontSize: 22, fontWeight: FontWeight.w700),
            ),
            Text(
              (user?.isDriver ?? false) ? 'Motorista' : 'Passageiro',
              style: const TextStyle(color: Colors.grey),
            ),
            const SizedBox(height: 32),
            Card(
              child: Column(
                children: [
                  ListTile(
                    title: const Text('E-mail'),
                    trailing: Text(user?.email ?? ''),
                  ),
                  const Divider(height: 1),
                  ListTile(
                    title: const Text('Tipo de conta'),
                    trailing: Text((user?.isDriver ?? false) ? 'Motorista' : 'Passageiro'),
                  ),
                ],
              ),
            ),
            const Spacer(),
            OutlinedButton(
              onPressed: () => auth.logout(),
              child: const Text('Sair da conta'),
            ),
          ],
        ),
      ),
    );
  }
}
