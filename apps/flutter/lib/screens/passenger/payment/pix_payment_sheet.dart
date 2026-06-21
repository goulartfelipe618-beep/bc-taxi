import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:qr_flutter/qr_flutter.dart';

import '../../models/payment_intent.dart';
import '../../services/api_client.dart';
import '../../services/payment_service.dart';
import '../../theme/passenger_theme.dart';

class PixPaymentSheet extends StatefulWidget {
  const PixPaymentSheet({
    super.key,
    required this.intent,
    required this.token,
    this.onPaid,
  });

  final PaymentIntent intent;
  final String token;
  final VoidCallback? onPaid;

  static Future<bool?> show(
    BuildContext context, {
    required PaymentIntent intent,
    required String token,
  }) {
    return showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      backgroundColor: BcColors.black,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (ctx) => PixPaymentSheet(intent: intent, token: token),
    );
  }

  @override
  State<PixPaymentSheet> createState() => _PixPaymentSheetState();
}

class _PixPaymentSheetState extends State<PixPaymentSheet> {
  late PaymentIntent _intent = widget.intent;
  bool _polling = false;
  String? _error;

  PaymentService get _payments => PaymentService(ApiClient(widget.token));

  Future<void> _pollPayment() async {
    if (_polling) return;
    setState(() {
      _polling = true;
      _error = null;
    });
    try {
      final updated = await _payments.pollUntilAuthorized(_intent.id);
      if (!mounted) return;
      setState(() => _intent = updated);
      widget.onPaid?.call();
      Navigator.of(context).pop(true);
    } catch (e) {
      if (!mounted) return;
      setState(() => _error = e.toString());
    } finally {
      if (mounted) setState(() => _polling = false);
    }
  }

  Future<void> _copyPayload() async {
    final payload = _intent.pix?.qrCodePayload;
    if (payload == null) return;
    await Clipboard.setData(ClipboardData(text: payload));
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(content: Text('Código PIX copiado')),
    );
  }

  @override
  Widget build(BuildContext context) {
    final pix = _intent.pix;
    final bottom = MediaQuery.paddingOf(context).bottom;

    return Padding(
      padding: EdgeInsets.fromLTRB(20, 12, 20, 20 + bottom),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Center(
            child: Container(
              width: 40,
              height: 4,
              decoration: BoxDecoration(
                color: Colors.white24,
                borderRadius: BorderRadius.circular(2),
              ),
            ),
          ),
          const SizedBox(height: 16),
          Text(
            'Pague com PIX',
            style: Theme.of(context).textTheme.titleLarge?.copyWith(
                  color: Colors.white,
                  fontWeight: FontWeight.w700,
                ),
          ),
          const SizedBox(height: 8),
          Text(
            pix?.amountLabel ?? '',
            style: Theme.of(context).textTheme.headlineSmall?.copyWith(
                  color: BcColors.blue,
                  fontWeight: FontWeight.bold,
                ),
          ),
          const SizedBox(height: 8),
          Text(
            _intent.statusLabel,
            style: const TextStyle(color: Colors.white70),
          ),
          if (pix != null) ...[
            const SizedBox(height: 20),
            Center(
              child: Container(
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: Colors.white,
                  borderRadius: BorderRadius.circular(16),
                ),
                child: QrImageView(
                  data: pix.qrCodePayload,
                  version: QrVersions.auto,
                  size: 200,
                ),
              ),
            ),
            const SizedBox(height: 12),
            OutlinedButton.icon(
              onPressed: _copyPayload,
              icon: const Icon(Icons.copy_rounded),
              label: const Text('Copiar código PIX'),
            ),
          ],
          if (_error != null) ...[
            const SizedBox(height: 8),
            Text(_error!, style: const TextStyle(color: Colors.redAccent)),
          ],
          const SizedBox(height: 16),
          FilledButton(
            onPressed: _polling ? null : _pollPayment,
            child: _polling
                ? const SizedBox(
                    height: 22,
                    width: 22,
                    child: CircularProgressIndicator(strokeWidth: 2),
                  )
                : const Text('Já paguei — verificar'),
          ),
        ],
      ),
    );
  }
}

class PaymentStatusBanner extends StatelessWidget {
  const PaymentStatusBanner({super.key, required this.intent});

  final PaymentIntent intent;

  @override
  Widget build(BuildContext context) {
    Color bg;
    IconData icon;
    if (intent.isFailed) {
      bg = Colors.red.shade900.withValues(alpha: 0.85);
      icon = Icons.error_outline;
    } else if (intent.needsPixAction) {
      bg = Colors.orange.shade900.withValues(alpha: 0.85);
      icon = Icons.qr_code_2;
    } else if (intent.isAuthorized || intent.isCaptured) {
      bg = Colors.green.shade900.withValues(alpha: 0.85);
      icon = Icons.check_circle_outline;
    } else {
      bg = BcColors.gray;
      icon = Icons.payment;
    }

    return Container(
      width: double.infinity,
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
      decoration: BoxDecoration(
        color: bg,
        borderRadius: BorderRadius.circular(12),
      ),
      child: Row(
        children: [
          Icon(icon, color: Colors.white, size: 20),
          const SizedBox(width: 10),
          Expanded(
            child: Text(
              intent.statusLabel,
              style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w600),
            ),
          ),
        ],
      ),
    );
  }
}
