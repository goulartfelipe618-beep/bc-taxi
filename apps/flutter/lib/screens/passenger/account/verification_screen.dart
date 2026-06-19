import 'package:flutter/material.dart';

import '../../../theme/passenger_theme.dart';
import '../../../widgets/passenger/bc_subpage_scaffold.dart';

class VerificationScreen extends StatefulWidget {
  const VerificationScreen({super.key});

  @override
  State<VerificationScreen> createState() => _VerificationScreenState();
}

class _VerificationScreenState extends State<VerificationScreen> {
  int _step = 0;

  @override
  Widget build(BuildContext context) {
    return BcSubpageScaffold(
      title: 'Verificação de identidade',
      body: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            LinearProgressIndicator(value: (_step + 1) / 3, backgroundColor: BcColors.grayLight, color: BcColors.black),
            const SizedBox(height: 24),
            Text(_stepTitle, style: PassengerTheme.titleMedium),
            const SizedBox(height: 8),
            Text(_stepDescription, style: PassengerTheme.caption),
            const Spacer(),
            if (_step < 2)
              FilledButton(
                onPressed: () => setState(() => _step++),
                style: FilledButton.styleFrom(backgroundColor: BcColors.black, padding: const EdgeInsets.symmetric(vertical: 16)),
                child: Text(_step == 0 ? 'Fotografar documento' : 'Tirar selfie'),
              )
            else
              FilledButton(
                onPressed: () {
                  Navigator.pop(context);
                  ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Verificação enviada para análise')));
                },
                style: FilledButton.styleFrom(backgroundColor: BcColors.black, padding: const EdgeInsets.symmetric(vertical: 16)),
                child: const Text('Enviar verificação'),
              ),
          ],
        ),
      ),
    );
  }

  String get _stepTitle {
    switch (_step) {
      case 0:
        return 'Documento de identificação';
      case 1:
        return 'Selfie de verificação';
      default:
        return 'Rever e enviar';
    }
  }

  String get _stepDescription {
    switch (_step) {
      case 0:
        return 'Fotografe a frente do seu RG ou CNH.';
      case 1:
        return 'Tire uma selfie para confirmar que é você.';
      default:
        return 'Confirme que as fotos estão legíveis antes de enviar.';
    }
  }
}
