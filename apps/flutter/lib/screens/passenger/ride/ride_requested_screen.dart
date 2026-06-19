import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../../../models/ride.dart';
import '../../../services/api_client.dart';
import '../../../services/realtime_service.dart';
import '../../../services/ride_service.dart';
import '../../../theme/passenger_theme.dart';
import '../../../widgets/passenger/ride_review_sheet.dart';

class RideActiveScreen extends StatefulWidget {
  const RideActiveScreen({
    super.key,
    required this.rideId,
    required this.categoryName,
    required this.destination,
    required this.token,
  });

  final String rideId;
  final String categoryName;
  final String destination;
  final String token;

  @override
  State<RideActiveScreen> createState() => _RideActiveScreenState();
}

class _RideActiveScreenState extends State<RideActiveScreen> {
  late final RideService _rideService = RideService(ApiClient(widget.token));
  late final RealtimeService _realtime = RealtimeService(token: widget.token);
  Timer? _pollTimer;
  RideDetail? _detail;
  String? _error;
  bool _reviewShown = false;
  final _codeController = TextEditingController();
  bool _verifying = false;

  RideRecord? get _ride => _detail?.ride;

  @override
  void initState() {
    super.initState();
    _realtime.addListener(_onRealtimeEvent);
    _realtime.connect();
    _realtime.subscribeRide(widget.rideId);
    _poll();
    _pollTimer = Timer.periodic(const Duration(seconds: 8), (_) => _poll());
  }

  void _onRealtimeEvent(Map<String, dynamic> event) {
    final rideId = eventRideId(event);
    if (rideId == null || rideId != widget.rideId) return;
    _poll();
  }

  @override
  void dispose() {
    _pollTimer?.cancel();
    _realtime.removeListener(_onRealtimeEvent);
    _realtime.disconnect();
    _codeController.dispose();
    super.dispose();
  }

  Future<void> _poll() async {
    try {
      final detail = await _rideService.getRide(widget.rideId);
      if (!mounted) return;
      setState(() {
        _detail = detail;
        _error = null;
      });
      if (detail.ride.isTerminal) {
        _pollTimer?.cancel();
        if (detail.ride.status == 'COMPLETED' && !_reviewShown) {
          _reviewShown = true;
          _showReview();
        }
      }
    } catch (e) {
      if (!mounted) return;
      setState(() => _error = e.toString());
    }
  }

  Future<void> _showReview() async {
    await Future<void>.delayed(const Duration(milliseconds: 400));
    if (!mounted) return;
    final result = await showRideReviewSheet(context, targetLabel: 'o motorista');
    if (result == null || !mounted) return;
    try {
      await _rideService.submitReview(widget.rideId, stars: result.stars, comment: result.comment);
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Obrigado pela avaliação!')));
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.toString())));
    }
  }

  Future<void> _cancel() async {
    try {
      await _rideService.cancelRide(widget.rideId);
      if (!mounted) return;
      Navigator.of(context).popUntil((r) => r.isFirst);
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Corrida cancelada')));
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.toString())));
    }
  }

  Future<void> _verifyCode() async {
    final code = _codeController.text.trim();
    if (code.length != 6) return;
    setState(() => _verifying = true);
    try {
      await _rideService.verifyDriverCode(widget.rideId, code);
      _codeController.clear();
      await _poll();
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.toString())));
    } finally {
      if (mounted) setState(() => _verifying = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final ride = _ride;

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
              if (_error != null) ...[
                Text(_error!, style: const TextStyle(color: Colors.red)),
                const SizedBox(height: 8),
              ],
              const Spacer(),
              _StatusIcon(status: ride?.status),
              const SizedBox(height: 16),
              Text(
                ride?.statusLabel ?? 'A carregar…',
                style: PassengerTheme.titleLarge,
                textAlign: TextAlign.center,
              ),
              const SizedBox(height: 8),
              Text(
                _subtitle(ride),
                style: PassengerTheme.caption,
                textAlign: TextAlign.center,
              ),
              const SizedBox(height: 24),
              if (ride != null) _buildStatusCard(ride),
              const Spacer(),
              if (ride?.canCancel == true)
                OutlinedButton(
                  onPressed: _cancel,
                  child: const Text('Cancelar corrida'),
                ),
              if (ride?.status == 'COMPLETED')
                FilledButton(
                  onPressed: () => Navigator.of(context).popUntil((r) => r.isFirst),
                  style: FilledButton.styleFrom(backgroundColor: BcColors.black),
                  child: const Text('Concluir'),
                ),
            ],
          ),
        ),
      ),
    );
  }

  String _subtitle(RideRecord? ride) {
    if (ride == null) return 'A procurar motorista para ${widget.destination}';
    switch (ride.status) {
      case 'REQUESTED':
      case 'OFFERING':
        return 'A procurar motorista para ${widget.destination}';
      case 'DRIVER_ASSIGNED':
        return '${widget.categoryName} · a caminho do local de recolha';
      case 'DRIVER_ARRIVED':
        return 'Motorista no local · confirme o código';
      case 'IN_PROGRESS':
        return 'Viagem em andamento para ${widget.destination}';
      case 'COMPLETED':
        return 'Viagem concluída · ${ride.fareLabel}';
      case 'NO_DRIVERS':
        return 'Não encontrámos motoristas disponíveis';
      default:
        return widget.destination;
    }
  }

  Widget _buildStatusCard(RideRecord ride) {
    if (ride.status == 'DRIVER_ARRIVED' || (ride.status == 'IN_PROGRESS' && _detail?.verification?.driverVerified == false)) {
      return _codeEntryCard();
    }
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(color: BcColors.grayLight, borderRadius: BorderRadius.circular(12)),
      child: Column(
        children: [
          Text(_cardTitle(ride.status), style: const TextStyle(fontWeight: FontWeight.w600)),
          const SizedBox(height: 4),
          Text(_cardValue(ride), style: PassengerTheme.titleMedium.copyWith(fontSize: 28)),
        ],
      ),
    );
  }

  Widget _codeEntryCard() {
    final verification = _detail?.verification;
    final startCodes = _detail?.startCodes;
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(color: BcColors.grayLight, borderRadius: BorderRadius.circular(12)),
      child: Column(
        children: [
          if (startCodes != null) ...[
            const Text('O seu código', style: TextStyle(fontWeight: FontWeight.w600)),
            const SizedBox(height: 4),
            Text(startCodes.yours, style: PassengerTheme.titleMedium.copyWith(fontSize: 32, letterSpacing: 6)),
            const SizedBox(height: 4),
            Text('Mostre ao motorista', style: PassengerTheme.caption),
            const SizedBox(height: 16),
          ],
          const Text('Código do motorista', style: TextStyle(fontWeight: FontWeight.w600)),
          const SizedBox(height: 12),
          TextField(
            controller: _codeController,
            keyboardType: TextInputType.number,
            maxLength: 6,
            textAlign: TextAlign.center,
            inputFormatters: [FilteringTextInputFormatter.digitsOnly],
            style: const TextStyle(fontSize: 24, fontWeight: FontWeight.w700, letterSpacing: 8),
            decoration: InputDecoration(
              counterText: '',
              hintText: '000000',
              filled: true,
              fillColor: Colors.white,
              border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
            ),
          ),
          const SizedBox(height: 12),
          FilledButton(
            onPressed: _verifying ? null : _verifyCode,
            style: FilledButton.styleFrom(backgroundColor: BcColors.black, minimumSize: const Size(double.infinity, 48)),
            child: _verifying
                ? const SizedBox(height: 20, width: 20, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                : const Text('Confirmar embarque'),
          ),
          if (verification != null && !verification.driverVerified) ...[
            const SizedBox(height: 8),
            Text(
              verification.passengerVerified ? 'Aguardando confirmação do motorista' : 'Insira o código mostrado pelo motorista',
              style: PassengerTheme.caption,
              textAlign: TextAlign.center,
            ),
          ],
        ],
      ),
    );
  }

  String _cardTitle(String status) {
    switch (status) {
      case 'DRIVER_ASSIGNED':
        return 'Chegada estimada do motorista';
      case 'IN_PROGRESS':
        return 'A caminho do destino';
      case 'COMPLETED':
        return 'Total da corrida';
      default:
        return 'Tempo estimado';
    }
  }

  String _cardValue(RideRecord ride) {
    switch (ride.status) {
      case 'REQUESTED':
      case 'OFFERING':
        return '4 min';
      case 'DRIVER_ASSIGNED':
        return '4 min';
      case 'IN_PROGRESS':
        return ride.dropoffAddress ?? widget.destination;
      case 'COMPLETED':
        return ride.fareLabel;
      default:
        return '—';
    }
  }
}

class _StatusIcon extends StatelessWidget {
  const _StatusIcon({this.status});

  final String? status;

  @override
  Widget build(BuildContext context) {
    final icon = switch (status) {
      'COMPLETED' => Icons.check_circle_outline,
      'CANCELLED' || 'NO_DRIVERS' => Icons.cancel_outlined,
      'IN_PROGRESS' => Icons.navigation_outlined,
      'DRIVER_ARRIVED' => Icons.pin_drop_outlined,
      'DRIVER_ASSIGNED' => Icons.directions_car_outlined,
      _ => Icons.hourglass_top_outlined,
    };
    return Icon(icon, size: 72);
  }
}

/// Mantido para compatibilidade com imports antigos.
class RideRequestedScreen extends RideActiveScreen {
  const RideRequestedScreen({
    super.key,
    required super.rideId,
    required String category,
    required super.destination,
    required super.token,
  }) : super(categoryName: category);
}
