import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../../../models/payment_intent.dart';
import '../../../models/ride.dart';
import '../../../services/api_client.dart';
import '../../../services/payment_service.dart';
import '../../../services/realtime_service.dart';
import '../../../services/ride_service.dart';
import '../../../theme/passenger_theme.dart';
import '../../../widgets/passenger/ride_review_sheet.dart';
import '../payment/pix_payment_sheet.dart';
import 'ride_tracking_map.dart';

class RideActiveScreen extends StatefulWidget {
  const RideActiveScreen({
    super.key,
    required this.rideId,
    required this.categoryName,
    required this.destination,
    required this.token,
    this.initialPayment,
  });

  final String rideId;
  final String categoryName;
  final String destination;
  final String token;
  final PaymentIntent? initialPayment;

  @override
  State<RideActiveScreen> createState() => _RideActiveScreenState();
}

class _RideActiveScreenState extends State<RideActiveScreen> {
  late final RideService _rideService = RideService(ApiClient(widget.token));
  late final PaymentService _paymentService = PaymentService(ApiClient(widget.token));
  late final RealtimeService _realtime = RealtimeService(token: widget.token);
  Timer? _pollTimer;
  RideDetail? _detail;
  PaymentIntent? _payment;
  DriverLocation? _liveDriverLocation;
  DateTime? _lastLocationUiUpdate;
  String? _error;
  bool _reviewShown = false;
  final _codeController = TextEditingController();
  bool _verifying = false;

  RideRecord? get _ride => _detail?.ride;
  RideTracking? get _tracking => _detail?.tracking;
  DriverLocation? get _driverLocation => _liveDriverLocation ?? _tracking?.driverLocation;

  @override
  void initState() {
    super.initState();
    _payment = widget.initialPayment;
    _realtime.addListener(_onRealtimeEvent);
    _realtime.connect();
    _realtime.subscribeRide(widget.rideId);
    _poll();
    _pollTimer = Timer.periodic(const Duration(seconds: 8), (_) => _poll());
  }

  void _onRealtimeEvent(Map<String, dynamic> event) {
    final type = eventType(event);
    final rideId = event['rideId'] as String? ?? eventRideId(event);
    if (rideId != null && rideId != widget.rideId) return;

    if (type == 'DRIVER_LOCATION_UPDATED') {
      final payload = event['payload'] as Map<String, dynamic>? ?? event;
      final lat = payload['lat'];
      final lng = payload['lng'];
      if (lat is num && lng is num) {
        final now = DateTime.now();
        if (_lastLocationUiUpdate != null &&
            now.difference(_lastLocationUiUpdate!) < const Duration(seconds: 8)) {
          return;
        }
        _lastLocationUiUpdate = now;
        setState(() {
          _liveDriverLocation = DriverLocation(
            lat: lat.toDouble(),
            lng: lng.toDouble(),
            updatedAt: now.toIso8601String(),
            heading: payload['heading'] is num ? (payload['heading'] as num).toDouble() : null,
          );
        });
      }
      return;
    }

    if (type == 'PAYMENT_AUTHORIZED' || type == 'PAYMENT_CAPTURED' || type == 'PAYMENT_FAILED') {
      _refreshPayment();
      return;
    }

    if (type != null &&
        (type.startsWith('RIDE_') || type == 'DRIVER_LOCATION_UPDATED')) {
      _poll();
    }
  }

  @override
  void dispose() {
    _pollTimer?.cancel();
    _realtime.removeListener(_onRealtimeEvent);
    _realtime.disconnect();
    _codeController.dispose();
    super.dispose();
  }

  Future<void> _refreshPayment() async {
    final intentId = _payment?.id ?? _detail?.payment?.id ?? _ride?.paymentIntentId;
    if (intentId == null) return;
    try {
      final intent = await _paymentService.fetchIntent(intentId);
      if (!mounted) return;
      setState(() => _payment = intent);
    } catch (_) {}
  }

  Future<void> _openPixSheet() async {
    final intent = _payment ?? _detail?.payment;
    if (intent == null || intent.pix == null) return;
    await PixPaymentSheet.show(context, intent: intent, token: widget.token);
    await _refreshPayment();
    await _poll();
  }

  Future<void> _poll() async {
    try {
      final detail = await _rideService.getRide(widget.rideId);
      if (!mounted) return;
      setState(() {
        _detail = detail;
        _payment = detail.payment ?? _payment;
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
    final tracking = _tracking;
    final showMap = ride != null &&
        _driverLocation != null &&
        ['DRIVER_ASSIGNED', 'DRIVER_ARRIVED', 'IN_PROGRESS'].contains(ride.status);

    return Scaffold(
      backgroundColor: Colors.white,
      body: SafeArea(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 8),
              child: Row(
                children: [
                  IconButton(
                    icon: const Icon(Icons.close),
                    onPressed: () => Navigator.of(context).popUntil((r) => r.isFirst),
                  ),
                  Expanded(
                    child: Text(
                      ride?.statusLabel ?? 'A carregar…',
                      style: PassengerTheme.titleMedium,
                      textAlign: TextAlign.center,
                    ),
                  ),
                  const SizedBox(width: 48),
                ],
              ),
            ),
            if (_error != null)
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: 16),
                child: Text(_error!, style: const TextStyle(color: Colors.red)),
              ),
            if (_payment != null) ...[
              Padding(
                padding: const EdgeInsets.fromLTRB(16, 0, 16, 8),
                child: PaymentStatusBanner(intent: _payment!),
              ),
              if (_payment!.needsPixAction && _payment!.pix != null)
                Padding(
                  padding: const EdgeInsets.fromLTRB(16, 0, 16, 8),
                  child: OutlinedButton.icon(
                    onPressed: _openPixSheet,
                    icon: const Icon(Icons.qr_code_2),
                    label: const Text('Abrir QR PIX'),
                  ),
                ),
            ],
            if (showMap) ...[
              Padding(
                padding: const EdgeInsets.fromLTRB(16, 8, 16, 0),
                child: SizedBox(
                  height: 220,
                  child: RideTrackingMap(ride: ride!, driverLocation: _driverLocation),
                ),
              ),
              const SizedBox(height: 12),
            ],
            Expanded(
              child: SingleChildScrollView(
                padding: const EdgeInsets.all(24),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    _StatusIcon(status: ride?.status),
                    const SizedBox(height: 12),
                    Text(
                      _headline(ride, tracking),
                      style: PassengerTheme.titleLarge,
                      textAlign: TextAlign.center,
                    ),
                    const SizedBox(height: 8),
                    Text(
                      _subtitle(ride),
                      style: PassengerTheme.caption,
                      textAlign: TextAlign.center,
                    ),
                    const SizedBox(height: 20),
                    if (tracking != null) _driverCard(tracking),
                    const SizedBox(height: 16),
                    if (ride != null) _buildStatusCard(ride, tracking),
                  ],
                ),
              ),
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(24, 0, 24, 16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  if (ride?.canCancel == true)
                    OutlinedButton(onPressed: _cancel, child: const Text('Cancelar corrida')),
                  if (ride?.status == 'COMPLETED')
                    FilledButton(
                      onPressed: () => Navigator.of(context).popUntil((r) => r.isFirst),
                      style: FilledButton.styleFrom(backgroundColor: BcColors.black),
                      child: const Text('Concluir'),
                    ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  String _headline(RideRecord? ride, RideTracking? tracking) {
    if (tracking?.eta != null) {
      return tracking!.eta!.label;
    }
    return ride?.statusLabel ?? 'A procurar motorista…';
  }

  String _subtitle(RideRecord? ride) {
    if (ride == null) return 'A procurar motorista para ${widget.destination}';
    switch (ride.status) {
      case 'REQUESTED':
      case 'OFFERING':
        return 'A procurar motorista para ${widget.destination}';
      case 'DRIVER_ASSIGNED':
        return tracking?.eta?.target == 'pickup'
            ? 'Motorista a caminho do local de recolha'
            : '${widget.categoryName} · a caminho do local de recolha';
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

  Widget _driverCard(RideTracking tracking) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: BcColors.grayLight,
        borderRadius: BorderRadius.circular(12),
      ),
      child: Row(
        children: [
          CircleAvatar(
            backgroundColor: Colors.black,
            child: Text(
              tracking.driver.fullName.isNotEmpty ? tracking.driver.fullName[0].toUpperCase() : '?',
              style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold),
            ),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(tracking.driver.fullName, style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 16)),
                Text(tracking.driver.vehicleLabel, style: PassengerTheme.caption),
                Text('★ ${tracking.driver.rating.toStringAsFixed(1)}', style: PassengerTheme.caption),
              ],
            ),
          ),
          if (tracking.eta != null)
            Column(
              crossAxisAlignment: CrossAxisAlignment.end,
              children: [
                Text(tracking.eta!.label, style: PassengerTheme.titleMedium.copyWith(fontSize: 22)),
                Text(
                  tracking.eta!.target == 'dropoff' ? 'até destino' : 'até recolha',
                  style: PassengerTheme.caption,
                ),
              ],
            ),
        ],
      ),
    );
  }

  Widget _buildStatusCard(RideRecord ride, RideTracking? tracking) {
    if (ride.status == 'DRIVER_ARRIVED' ||
        (ride.status == 'IN_PROGRESS' && _detail?.verification?.driverVerified == false)) {
      return _codeEntryCard();
    }
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(color: BcColors.grayLight, borderRadius: BorderRadius.circular(12)),
      child: Column(
        children: [
          Text(_cardTitle(ride.status), style: const TextStyle(fontWeight: FontWeight.w600)),
          const SizedBox(height: 4),
          Text(_cardValue(ride, tracking), style: PassengerTheme.titleMedium.copyWith(fontSize: 28)),
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

  String _cardValue(RideRecord ride, RideTracking? tracking) {
    switch (ride.status) {
      case 'REQUESTED':
      case 'OFFERING':
        return '…';
      case 'DRIVER_ASSIGNED':
      case 'IN_PROGRESS':
        return tracking?.eta?.label ?? '…';
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
    return Icon(icon, size: 56);
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
