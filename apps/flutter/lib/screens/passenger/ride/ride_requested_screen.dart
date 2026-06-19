import 'package:flutter/material.dart';

import '../../../theme/passenger_theme.dart';

class RideRequestedScreen extends StatelessWidget {
  const RideRequestedScreen({super.key, required this.category, required this.destination});

  final String category;
  final String destination;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.white,
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Align(
                alignment: Alignment.centerLeft,
                child: IconButton(
                  icon: const Icon(Icons.close),
                  onPressed: () => Navigator.of(context).popUntil((r) => r.isFirst),
                ),
              ),
              const Spacer(),
              const Icon(Icons.check_circle_outline, size: 72),
              const SizedBox(height: 16),
              Text('$category solicitado', style: PassengerTheme.titleLarge, textAlign: TextAlign.center),
              const SizedBox(height: 8),
              Text('A procurar motorista para $destination', style: PassengerTheme.caption, textAlign: TextAlign.center),
              const SizedBox(height: 24),
              Container(
                padding: const EdgeInsets.all(16),
                decoration: BoxDecoration(color: BcColors.grayLight, borderRadius: BorderRadius.circular(12)),
                child: Column(
                  children: [
                    const Text('Chegada estimada do motorista', style: TextStyle(fontWeight: FontWeight.w600)),
                    const SizedBox(height: 4),
                    Text('4 min', style: PassengerTheme.titleMedium.copyWith(fontSize: 28)),
                  ],
                ),
              ),
              const Spacer(),
              OutlinedButton(
                onPressed: () {
                  Navigator.of(context).popUntil((r) => r.isFirst);
                  ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Corrida cancelada')));
                },
                child: const Text('Cancelar corrida'),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
