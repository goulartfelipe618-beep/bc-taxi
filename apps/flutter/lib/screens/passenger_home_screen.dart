import 'package:flutter/material.dart';

import '../../theme/passenger_theme.dart';
import 'passenger/passenger_home_tab.dart';
import 'passenger/passenger_services_tab.dart';
import 'passenger/passenger_activity_tab.dart';
import 'passenger/passenger_account_tab.dart';

class PassengerHomeScreen extends StatefulWidget {
  const PassengerHomeScreen({super.key});

  @override
  State<PassengerHomeScreen> createState() => _PassengerHomeScreenState();
}

class _PassengerHomeScreenState extends State<PassengerHomeScreen> {
  int _tab = 0;

  static const _labels = ['Início', 'Serviços', 'Atividade', 'Conta'];

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.white,
      body: IndexedStack(
        index: _tab,
        children: [
          PassengerHomeTab(),
          PassengerServicesTab(),
          PassengerActivityTab(),
          PassengerAccountTab(),
        ],
      ),
      bottomNavigationBar: Container(
        decoration: BoxDecoration(
          color: Colors.white,
          boxShadow: [BoxShadow(color: Colors.black.withValues(alpha: 0.06), blurRadius: 12, offset: const Offset(0, -2))],
        ),
        child: SafeArea(
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 6),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.spaceAround,
              children: List.generate(4, (i) {
                final selected = _tab == i;
                return InkWell(
                  onTap: () => setState(() => _tab = i),
                  borderRadius: BorderRadius.circular(999),
                  child: AnimatedContainer(
                    duration: const Duration(milliseconds: 200),
                    padding: EdgeInsets.symmetric(horizontal: selected ? 16 : 12, vertical: 8),
                    decoration: BoxDecoration(
                      color: selected ? BcColors.black : Colors.transparent,
                      borderRadius: BorderRadius.circular(999),
                    ),
                    child: Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Icon(
                          _iconFor(i, selected),
                          size: 22,
                          color: selected ? Colors.white : BcColors.black,
                        ),
                        if (selected) ...[
                          const SizedBox(width: 6),
                          Text(
                            _labels[i],
                            style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w600, fontSize: 13),
                          ),
                        ],
                      ],
                    ),
                  ),
                );
              }),
            ),
          ),
        ),
      ),
    );
  }

  IconData _iconFor(int index, bool selected) {
    switch (index) {
      case 0:
        return selected ? Icons.home : Icons.home_outlined;
      case 1:
        return selected ? Icons.apps : Icons.apps_outlined;
      case 2:
        return selected ? Icons.bookmark : Icons.bookmark_outline;
      default:
        return selected ? Icons.person : Icons.person_outline;
    }
  }
}
