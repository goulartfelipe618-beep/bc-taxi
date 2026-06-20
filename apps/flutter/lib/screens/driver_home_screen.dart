import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';

import '../models/ride.dart';
import '../services/api_client.dart';
import '../services/auth_service.dart';
import '../services/driver_fleet_service.dart';
import '../services/driver_location_tracker.dart';
import '../services/driver_service.dart';
import '../services/realtime_service.dart';
import '../widgets/passenger/ride_review_sheet.dart';
import 'driver_compliance_screen.dart';
import 'login_screen.dart';

class DriverHomeScreen extends StatefulWidget {
  const DriverHomeScreen({super.key});

  @override
  State<DriverHomeScreen> createState() => _DriverHomeScreenState();
}

class _DriverHomeScreenState extends State<DriverHomeScreen> {
  int _tab = 0;
  bool _online = false;
  Timer? _pollTimer;
  List<DriverOffer> _offers = [];
  RideRecord? _activeRide;
  RideVerification? _verification;
  StartCodes? _startCodes;
  String? _error;
  bool _busy = false;
  DriverCompliance? _compliance;
  bool _complianceLoading = true;
  final _codeController = TextEditingController();
  RealtimeService? _realtime;
  DriverLocationTracker? _locationTracker;

  @override
  void initState() {
    super.initState();
    _loadCompliance();
  }

  DriverFleetService? get _fleetService {
    final token = context.read<AuthService>().token;
    if (token == null) return null;
    return DriverFleetService(ApiClient(token));
  }

  Future<void> _loadCompliance() async {
    final fleet = _fleetService;
    if (fleet == null) return;
    setState(() => _complianceLoading = true);
    try {
      final c = await fleet.fetchCompliance();
      if (!mounted) return;
      setState(() {
        _compliance = c;
        _complianceLoading = false;
      });
    } catch (_) {
      if (!mounted) return;
      setState(() => _complianceLoading = false);
    }
  }

  void _onRealtimeEvent(Map<String, dynamic> event) {
    final type = eventType(event);
    if (type == 'RIDE_OFFERED' || type == 'RIDE_CANCELLED') _poll();
    if (type == 'RIDE_DRIVER_ASSIGNED' || type == 'RIDE_COMPLETED' || type == 'RIDE_DRIVER_ARRIVED') _poll();
  }

  void _ensureRealtime() {
    final token = context.read<AuthService>().token;
    if (token == null) return;
    _realtime ??= RealtimeService(token: token)
      ..addListener(_onRealtimeEvent)
      ..connect();
  }

  void _stopRealtime() {
    _realtime?.removeListener(_onRealtimeEvent);
    _realtime?.disconnect();
    _realtime = null;
  }

  DriverService? get _driverService {
    final token = context.read<AuthService>().token;
    if (token == null) return null;
    return DriverService(ApiClient(token));
  }

  @override
  void dispose() {
    _pollTimer?.cancel();
    _locationTracker?.stop();
    _stopRealtime();
    _codeController.dispose();
    super.dispose();
  }

  Future<void> _logout() async {
    if (_online) await _setOnline(false);
    await context.read<AuthService>().logout();
    if (!mounted) return;
    Navigator.of(context).pushAndRemoveUntil(MaterialPageRoute(builder: (_) => const LoginScreen()), (_) => false);
  }

  Future<void> _setOnline(bool online) async {
    final svc = _driverService;
    if (svc == null) return;

    if (online && _compliance != null && !_compliance!.canOperate) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Complete veículo e documentos antes de ficar online')),
      );
      await Navigator.push(
        context,
        MaterialPageRoute(builder: (_) => const DriverComplianceScreen()),
      );
      await _loadCompliance();
      return;
    }

    setState(() => _busy = true);
    try {
      double? lat;
      double? lng;
      if (online) {
        _locationTracker ??= DriverLocationTracker(svc);
        final pos = await _locationTracker!.getCurrentPosition();
        if (pos == null) {
          if (!mounted) return;
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(content: Text('Ative a localização do dispositivo para ficar online')),
          );
          return;
        }
        lat = pos.latitude;
        lng = pos.longitude;
      }

      await svc.setOnline(
        online: online,
        lat: lat,
        lng: lng,
        enabledCategories: _compliance?.enabledCategories,
      );
      if (!mounted) return;
      setState(() => _online = online);
      await _loadCompliance();
      if (online) {
        _locationTracker ??= DriverLocationTracker(svc);
        await _locationTracker!.start(rideId: _activeRide?.id);
        _ensureRealtime();
        _startPolling();
      } else {
        _locationTracker?.stop();
        _pollTimer?.cancel();
        _stopRealtime();
        setState(() {
          _offers = [];
          _activeRide = null;
        });
      }
    } on ApiException catch (e) {
      if (!mounted) return;
      if (e.statusCode == 403 && e.extra?['compliance'] != null) {
        setState(() {
          _compliance = DriverCompliance.fromJson({'compliance': e.extra!['compliance']});
        });
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(e.message)),
        );
        await Navigator.push(
          context,
          MaterialPageRoute(builder: (_) => const DriverComplianceScreen()),
        );
        await _loadCompliance();
      } else {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.message)));
      }
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.toString())));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  void _startPolling() {
    _pollTimer?.cancel();
    _poll();
    _pollTimer = Timer.periodic(const Duration(seconds: 3), (_) => _poll());
  }

  Future<void> _poll() async {
    final svc = _driverService;
    if (svc == null || !_online) return;
    try {
      if (_activeRide != null && !_activeRide!.isTerminal) {
        final detail = await svc.getRide(_activeRide!.id);
        if (!mounted) return;
        setState(() {
          _activeRide = detail.ride;
          _verification = detail.verification;
          _startCodes = detail.startCodes;
        });
        if (detail.ride.status == 'COMPLETED') {
          _pollTimer?.cancel();
          _promptReview(detail.ride.id);
        }
        return;
      }

      final offers = await svc.fetchOffers();
      if (!mounted) return;
      setState(() {
        _offers = offers;
        _error = null;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() => _error = e.toString());
    }
  }

  Future<void> _promptReview(String rideId) async {
    final result = await showRideReviewSheet(context, targetLabel: 'o passageiro');
    if (result == null) return;
    try {
      await _driverService?.submitReview(rideId, stars: result.stars, comment: result.comment);
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Avaliação enviada')));
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.toString())));
    } finally {
      if (mounted) setState(() => _activeRide = null);
    }
  }

  Future<void> _acceptOffer(DriverOffer offer) async {
    final svc = _driverService;
    if (svc == null) return;
    setState(() => _busy = true);
    try {
      final ride = await svc.acceptOffer(offer.offerId);
      if (!mounted) return;
      setState(() {
        _activeRide = ride;
        _offers = [];
      });
      await _locationTracker?.start(rideId: ride.id);
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.toString())));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _rejectOffer(DriverOffer offer) async {
    try {
      await _driverService?.rejectOffer(offer.offerId);
      await _poll();
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.toString())));
    }
  }

  Future<void> _markArrived() async {
    final ride = _activeRide;
    final svc = _driverService;
    if (ride == null || svc == null) return;
    setState(() => _busy = true);
    try {
      final detail = await svc.markArrived(ride.id);
      if (!mounted) return;
      setState(() {
        _activeRide = detail.ride;
        _verification = detail.verification;
        _startCodes = detail.startCodes;
      });
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Chegada registada · peça ao passageiro o código')),
      );
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.toString())));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _verifyPassengerCode() async {
    final ride = _activeRide;
    final svc = _driverService;
    if (ride == null || svc == null) return;
    final code = _codeController.text.trim();
    if (code.length != 6) return;
    setState(() => _busy = true);
    try {
      final updated = await svc.verifyPassengerCode(ride.id, code);
      _codeController.clear();
      if (!mounted) return;
      setState(() => _activeRide = updated);
      await _poll();
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.toString())));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _completeRide() async {
    final ride = _activeRide;
    final svc = _driverService;
    if (ride == null || svc == null) return;
    setState(() => _busy = true);
    try {
      final updated = await svc.completeRide(ride.id);
      if (!mounted) return;
      setState(() => _activeRide = updated);
      _pollTimer?.cancel();
      await _promptReview(updated.id);
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.toString())));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final user = context.watch<AuthService>().user!;
    final firstName = user.fullName.split(' ').first;

    return Scaffold(
      appBar: AppBar(
        title: const Text('BC Taxi Motorista'),
        actions: [
          IconButton(
            icon: const Icon(Icons.description_outlined),
            tooltip: 'Veículo e documentos',
            onPressed: () async {
              await Navigator.push(
                context,
                MaterialPageRoute(builder: (_) => const DriverComplianceScreen()),
              );
              await _loadCompliance();
            },
          ),
          IconButton(icon: const Icon(Icons.logout), onPressed: _logout),
        ],
      ),
      body: IndexedStack(
        index: _tab,
        children: [
          _buildHomeTab(firstName),
          Center(child: Text(_activeRide != null ? 'Corrida ${_activeRide!.statusLabel}' : 'Sem corridas')),
          const Center(child: Text('Ganhos')),
          Padding(
            padding: const EdgeInsets.all(24),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text('Minha conta', style: TextStyle(fontSize: 28, fontWeight: FontWeight.w800)),
                Text(user.email, style: TextStyle(color: Colors.grey[600])),
                const Chip(label: Text('Motorista')),
              ],
            ),
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

  Widget _buildHomeTab(String firstName) {
    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        Row(
          children: [
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text('Olá, $firstName', style: const TextStyle(fontSize: 24, fontWeight: FontWeight.w800)),
                  Text(_online ? 'Você está online' : 'Fique online para receber corridas', style: TextStyle(color: Colors.grey[600])),
                ],
              ),
            ),
            FilledButton(
              onPressed: _busy ? null : () => _setOnline(!_online),
              style: FilledButton.styleFrom(
                backgroundColor: _online ? Colors.green : Colors.grey.shade200,
                foregroundColor: _online ? Colors.white : Colors.black,
              ),
              child: Text(_online ? 'Online' : 'Offline'),
            ),
          ],
        ),
        if (_error != null) ...[
          const SizedBox(height: 8),
          Text(_error!, style: const TextStyle(color: Colors.red)),
        ],
        if (!_complianceLoading && _compliance != null && !_compliance!.canOperate) ...[
          const SizedBox(height: 12),
          Card(
            color: Colors.amber.shade50,
            child: ListTile(
              leading: const Icon(Icons.warning_amber_rounded, color: Colors.orange),
              title: const Text('Cadastro incompleto'),
              subtitle: Text(_compliance!.blockReasons.take(2).join(' · ')),
              trailing: const Icon(Icons.chevron_right),
              onTap: () async {
                await Navigator.push(
                  context,
                  MaterialPageRoute(builder: (_) => const DriverComplianceScreen()),
                );
                await _loadCompliance();
              },
            ),
          ),
        ],
        const SizedBox(height: 16),
        if (_activeRide != null) _buildActiveRideCard(_activeRide!) else _buildOffersSection(),
      ],
    );
  }

  Widget _buildOffersSection() {
    if (!_online) {
      return Container(
        height: 140,
        decoration: BoxDecoration(color: Colors.grey.shade200, borderRadius: BorderRadius.circular(16)),
        child: const Center(child: Text('Ative o modo online')),
      );
    }
    if (_offers.isEmpty) {
      return Container(
        height: 140,
        decoration: BoxDecoration(color: Colors.grey.shade200, borderRadius: BorderRadius.circular(16)),
        child: const Center(child: Text('Aguardando solicitações…')),
      );
    }
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: _offers.map(_buildOfferCard).toList(),
    );
  }

  Widget _buildOfferCard(DriverOffer offer) {
    final ride = offer.ride;
    return Card(
      margin: const EdgeInsets.only(bottom: 12),
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(ride.categoryCode.toUpperCase(), style: const TextStyle(fontWeight: FontWeight.w800)),
            const SizedBox(height: 4),
            Text(ride.pickupAddress ?? 'Recolha', maxLines: 1, overflow: TextOverflow.ellipsis),
            Text('→ ${ride.dropoffAddress ?? ride.dropoffAddress}', maxLines: 1, overflow: TextOverflow.ellipsis),
            const SizedBox(height: 4),
            Text(ride.fareLabel, style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 18)),
            const SizedBox(height: 12),
            Row(
              children: [
                Expanded(
                  child: FilledButton(
                    onPressed: _busy ? null : () => _acceptOffer(offer),
                    child: const Text('Aceitar'),
                  ),
                ),
                const SizedBox(width: 8),
                OutlinedButton(
                  onPressed: _busy ? null : () => _rejectOffer(offer),
                  child: const Text('Recusar'),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildActiveRideCard(RideRecord ride) {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text(ride.statusLabel, style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w800)),
            const SizedBox(height: 8),
            Text('${ride.pickupAddress ?? "Recolha"} → ${ride.dropoffAddress ?? "Destino"}'),
            Text(ride.fareLabel, style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 18)),
            const SizedBox(height: 16),
            if (ride.status == 'DRIVER_ASSIGNED')
              FilledButton(onPressed: _busy ? null : _markArrived, child: const Text('Cheguei ao local')),
            if (ride.status == 'DRIVER_ARRIVED' || ride.status == 'IN_PROGRESS') ...[
              if (_startCodes != null) ...[
                Text('Seu código: ${_startCodes!.yours}', style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 18)),
                const SizedBox(height: 8),
              ],
              TextField(
                controller: _codeController,
                keyboardType: TextInputType.number,
                maxLength: 6,
                inputFormatters: [FilteringTextInputFormatter.digitsOnly],
                decoration: const InputDecoration(labelText: 'Código do passageiro', counterText: ''),
              ),
              FilledButton(onPressed: _busy ? null : _verifyPassengerCode, child: const Text('Validar passageiro')),
            ],
            if (ride.status == 'IN_PROGRESS') ...[
              const SizedBox(height: 8),
              FilledButton(
                onPressed: _busy ? null : _completeRide,
                style: FilledButton.styleFrom(backgroundColor: Colors.green),
                child: const Text('Finalizar corrida'),
              ),
            ],
            if (_verification != null) ...[
              const SizedBox(height: 8),
              Text(
                'Passageiro: ${_verification!.passengerVerified ? "✓" : "—"} · Motorista: ${_verification!.driverVerified ? "✓" : "—"}',
                style: TextStyle(color: Colors.grey[600]),
              ),
            ],
          ],
        ),
      ),
    );
  }
}
