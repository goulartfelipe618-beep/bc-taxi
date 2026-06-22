import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../constants/passenger_data.dart';
import '../../models/trip_draft.dart';
import '../../services/api_client.dart';
import '../../services/auth_service.dart';
import '../../services/catalog_service.dart';
import '../../services/client_bootstrap_service.dart';
import '../../services/promotion_service.dart';
import '../../services/ride_service.dart';
import '../../services/schedule_service.dart';
import '../../theme/passenger_theme.dart';
import '../../widgets/passenger/trip_route_map.dart';
import 'payment/pix_payment_sheet.dart';
import 'passenger_routes.dart';
import 'widgets/passenger_sheets.dart';

class ChooseRideScreen extends StatefulWidget {
  const ChooseRideScreen({
    super.key,
    required this.trip,
    this.preselectedCategoryId,
  });

  final TripDraft trip;
  final String? preselectedCategoryId;

  @override
  State<ChooseRideScreen> createState() => _ChooseRideScreenState();
}

class _ChooseRideScreenState extends State<ChooseRideScreen> {
  List<RideCategoryOption> _categories = rideCategories;
  late String _selectedId = widget.preselectedCategoryId ?? rideCategories.first.id;
  String _paymentLabel = 'PIX';
  String _paymentMethodId = demoPaymentMethodIds['pix']!;
  final _couponController = TextEditingController();
  String? _appliedCoupon;
  String? _couponLabel;
  int _discountCentavos = 0;
  final Map<String, int> _fareCentavosByCategory = {};
  bool _loadingCategories = true;
  bool _requesting = false;
  TripDraft? _tripWithRoute;

  RideCategoryOption get _selected => _categories.firstWhere((r) => r.id == _selectedId, orElse: () => _categories.first);

  @override
  void initState() {
    super.initState();
    _tripWithRoute = widget.trip;
    _loadCategories();
    _loadPaymentBootstrap();
  }

  Future<void> _loadPaymentBootstrap() async {
    final auth = context.read<AuthService>();
    final trip = _tripWithRoute ?? widget.trip;
    try {
      final bootstrap = await ClientBootstrapService.fetch(
        token: auth.token,
        lat: trip.pickupLat,
        lng: trip.pickupLng,
      );
      if (!mounted || bootstrap.paymentMethods.isEmpty) return;
      final defaultMethod = bootstrap.paymentMethods.firstWhere(
        (m) => m.isDefault,
        orElse: () => bootstrap.paymentMethods.first,
      );
      setState(() {
        _paymentLabel = defaultMethod.label;
        _paymentMethodId = defaultMethod.id;
      });
    } catch (_) {
      // Mantém fallback demo se bootstrap indisponível
    }
  }

  Future<void> _loadCategories() async {
    final immediateOnly = !widget.trip.scheduled;
    final cats = await CatalogService.fetchPassengerCategories(immediateOnly: immediateOnly);
    if (!mounted) return;
    setState(() {
      _categories = cats;
      _loadingCategories = false;
      if (!_categories.any((c) => c.id == _selectedId)) {
        _selectedId = widget.preselectedCategoryId != null && _categories.any((c) => c.id == widget.preselectedCategoryId)
            ? widget.preselectedCategoryId!
            : _categories.first.id;
      }
    });
    await _refreshQuotes();
  }

  Future<void> _refreshQuotes() async {
    final trip = _tripWithRoute ?? widget.trip;
    final distanceKm = trip.distanceKm ?? 7.0;
    final durationMin = trip.durationMin ?? 18.0;
    final updated = <RideCategoryOption>[];
    for (final c in _categories) {
      final quote = await CatalogService.fetchQuote(categoryCode: c.id, distanceKm: distanceKm, durationMin: durationMin);
      if (quote != null) _fareCentavosByCategory[c.id] = quote.passengerFareCentavos;
      updated.add(
        RideCategoryOption(
          id: c.id,
          name: c.name,
          capacity: c.capacity,
          priceLabel: quote?.passengerFareLabel ?? c.priceLabel,
          etaLabel: c.etaLabel,
          badge: c.badge,
          badgeIsGreen: c.badgeIsGreen,
          description: c.description,
          requiresScheduling: c.requiresScheduling,
        ),
      );
    }
    if (!mounted) return;
    setState(() => _categories = updated);
  }

  @override
  void dispose() {
    _couponController.dispose();
    super.dispose();
  }

  String _priceLabelFor(RideCategoryOption c) {
    final base = _fareCentavosByCategory[c.id];
    if (_appliedCoupon != null && c.id == _selectedId && _discountCentavos > 0 && base != null) {
      final after = base - _discountCentavos;
      return 'R\$ ${(after / 100).toStringAsFixed(2).replaceAll('.', ',')}';
    }
    return c.priceLabel;
  }

  Future<void> _applyCoupon() async {
    final auth = context.read<AuthService>();
    final token = auth.token;
    if (token == null) return;

    final code = _couponController.text.trim();
    if (code.isEmpty) return;

    final fare = _fareCentavosByCategory[_selectedId];
    if (fare == null) {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Aguarde a cotação da corrida')));
      return;
    }

    try {
      final result = await PromotionService(ApiClient(token)).validate(
        code: code,
        categoryCode: _selectedId,
        fareCentavos: fare,
      );
      if (!mounted) return;
      if (!result.valid) {
        setState(() {
          _appliedCoupon = null;
          _couponLabel = null;
          _discountCentavos = 0;
        });
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(result.reason ?? 'Cupom inválido')));
        return;
      }
      setState(() {
        _appliedCoupon = code.toUpperCase();
        _couponLabel = result.label;
        _discountCentavos = result.discountCentavos;
      });
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Cupom aplicado: -R\$ ${(result.discountCentavos / 100).toStringAsFixed(2).replaceAll('.', ',')}')),
      );
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.toString())));
    }
  }

  Future<void> _requestRide() async {
    final auth = context.read<AuthService>();
    final token = auth.token;
    if (token == null) return;

    setState(() => _requesting = true);
    try {
      final trip = _tripWithRoute ?? widget.trip;

      if (trip.scheduled && trip.scheduledAt != null) {
        final schedule = await ScheduleService(ApiClient(token)).create(
          categoryCode: _selectedId,
          pickupLat: trip.pickupLat,
          pickupLng: trip.pickupLng,
          pickupAddress: trip.pickupAddress,
          dropoffLat: trip.dropoffLat,
          dropoffLng: trip.dropoffLng,
          dropoffAddress: trip.dropoffAddress,
          scheduledAt: trip.scheduledAt!,
          paymentMethodId: _paymentMethodId,
          promoCode: _appliedCoupon,
          distanceKm: trip.distanceKm,
          durationMin: trip.durationMin,
        );
        if (!mounted) return;
        final when = trip.scheduledAt!;
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(
              'Corrida agendada para ${when.day.toString().padLeft(2, '0')}/${when.month.toString().padLeft(2, '0')} às ${when.hour}:${when.minute.toString().padLeft(2, '0')}',
            ),
          ),
        );
        Navigator.of(context).popUntil((route) => route.isFirst);
        return;
      }

      final rideService = RideService(ApiClient(token));
      final result = await rideService.createRide(
        trip: trip,
        categoryCode: _selectedId,
        paymentMethodId: _paymentMethodId,
        couponCode: _appliedCoupon,
      );
      if (!mounted) return;

      final payment = result.payment;
      if (payment != null && payment.needsPixAction && payment.pix != null) {
        final paid = await PixPaymentSheet.show(
          context,
          intent: payment,
          token: token,
        );
        if (!mounted) return;
        if (paid != true) {
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(content: Text('Confirme o PIX para iniciar a busca pelo motorista')),
          );
        }
      }

      PassengerRoutes.openRideActive(
        context,
        rideId: result.ride.id,
        category: _selected.name,
        destination: widget.trip.dropoffName,
        token: token,
        initialPayment: result.payment,
      );
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.toString())));
    } finally {
      if (mounted) setState(() => _requesting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final trip = _tripWithRoute ?? widget.trip;
    return Scaffold(
      backgroundColor: BcColors.grayLight,
      body: Column(
        children: [
          Expanded(
            flex: 2,
            child: Stack(
              children: [
                TripRouteMap(
                  pickupLat: trip.pickupLat,
                  pickupLng: trip.pickupLng,
                  dropoffLat: trip.dropoffLat,
                  dropoffLng: trip.dropoffLng,
                  stops: trip.stops,
                  routePoints: trip.routePoints,
                  pickupLabel: trip.pickupAddress,
                ),
                SafeArea(
                  child: Padding(
                    padding: const EdgeInsets.all(12),
                    child: Row(
                      children: [
                        CircleAvatar(
                          backgroundColor: Colors.white,
                          child: IconButton(
                            icon: const Icon(Icons.arrow_back, color: BcColors.black),
                            onPressed: () => Navigator.pop(context),
                          ),
                        ),
                        const SizedBox(width: 10),
                        Expanded(
                          child: InkWell(
                            onTap: () => PassengerRoutes.openPlanTrip(context, destination: trip.dropoffName),
                            child: Container(
                              padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
                              decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(12)),
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                mainAxisSize: MainAxisSize.min,
                                children: [
                                  Row(
                                    children: [
                                      const Icon(Icons.place_outlined, size: 14, color: BcColors.gray),
                                      const SizedBox(width: 4),
                                      Expanded(
                                        child: Text(
                                          trip.pickupAddress,
                                          style: PassengerTheme.caption.copyWith(fontSize: 12),
                                          maxLines: 1,
                                          overflow: TextOverflow.ellipsis,
                                        ),
                                      ),
                                    ],
                                  ),
                                  const SizedBox(height: 2),
                                  Text(
                                    trip.dropoffName,
                                    style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 15),
                                    maxLines: 1,
                                    overflow: TextOverflow.ellipsis,
                                  ),
                                ],
                              ),
                            ),
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
              ],
            ),
          ),
          Expanded(
            flex: 3,
            child: Container(
              width: double.infinity,
              decoration: const BoxDecoration(
                color: Colors.white,
                borderRadius: BorderRadius.vertical(top: Radius.circular(16)),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Padding(
                    padding: const EdgeInsets.fromLTRB(16, 20, 16, 8),
                    child: Text('Escolha uma corrida', style: PassengerTheme.titleMedium.copyWith(fontSize: 20)),
                  ),
                  Expanded(
                    child: _loadingCategories
                        ? const Center(child: CircularProgressIndicator(color: BcColors.black))
                        : ListView.builder(
                            padding: const EdgeInsets.symmetric(horizontal: 16),
                            itemCount: _categories.length,
                            itemBuilder: (context, i) {
                              final r = _categories[i];
                              final selected = r.id == _selectedId;
                              return Padding(
                                padding: const EdgeInsets.only(bottom: 10),
                                child: Material(
                                  color: selected ? BcColors.grayLight : Colors.white,
                                  borderRadius: BorderRadius.circular(12),
                                  child: InkWell(
                                    onTap: () => setState(() => _selectedId = r.id),
                                    borderRadius: BorderRadius.circular(12),
                                    child: Container(
                                      padding: const EdgeInsets.all(14),
                                      decoration: BoxDecoration(
                                        borderRadius: BorderRadius.circular(12),
                                        border: Border.all(color: selected ? BcColors.black : BcColors.border, width: selected ? 2 : 1),
                                      ),
                                      child: Row(
                                        children: [
                                          Container(
                                            width: 56,
                                            height: 40,
                                            decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(8)),
                                            child: const Icon(Icons.directions_car_filled, size: 32),
                                          ),
                                          const SizedBox(width: 12),
                                          Expanded(
                                            child: Column(
                                              crossAxisAlignment: CrossAxisAlignment.start,
                                              children: [
                                                Row(
                                                  children: [
                                                    Text(r.name, style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 16)),
                                                    const SizedBox(width: 4),
                                                    Icon(Icons.person_outline, size: 14, color: BcColors.gray),
                                                    Text('${r.capacity}', style: PassengerTheme.caption),
                                                  ],
                                                ),
                                                Text(r.etaLabel, style: PassengerTheme.caption),
                                                if (r.badge != null) ...[
                                                  const SizedBox(height: 4),
                                                  Text(
                                                    r.badge!,
                                                    style: TextStyle(
                                                      fontSize: 12,
                                                      fontWeight: FontWeight.w600,
                                                      color: r.badgeIsGreen ? BcColors.green : BcColors.blue,
                                                    ),
                                                  ),
                                                ],
                                              ],
                                            ),
                                          ),
                                          Text(_priceLabelFor(r), style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 15)),
                                        ],
                                      ),
                                    ),
                                  ),
                                ),
                              );
                            },
                          ),
                  ),
                  Padding(
                    padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
                    child: Row(
                      children: [
                        Expanded(
                          child: TextField(
                            controller: _couponController,
                            decoration: InputDecoration(
                              hintText: 'Cupom (ex: BCTAXI10)',
                              prefixIcon: const Icon(Icons.local_offer_outlined, size: 20),
                              suffixText: _appliedCoupon,
                              border: OutlineInputBorder(borderRadius: BorderRadius.circular(8)),
                              isDense: true,
                              contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 12),
                            ),
                            textCapitalization: TextCapitalization.characters,
                          ),
                        ),
                        const SizedBox(width: 8),
                        OutlinedButton(onPressed: _applyCoupon, child: const Text('Aplicar')),
                      ],
                    ),
                  ),
                  if (_couponLabel != null)
                    Padding(
                      padding: const EdgeInsets.symmetric(horizontal: 16),
                      child: Text(_couponLabel!, style: TextStyle(color: BcColors.green, fontWeight: FontWeight.w600, fontSize: 13)),
                    ),
                  Padding(
                    padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
                    child: InkWell(
                      onTap: () async {
                        final result = await PassengerRoutes.openPaymentMethods(context);
                        if (result != null && mounted) {
                          setState(() {
                            _paymentLabel = result.label;
                            _paymentMethodId = result.id;
                          });
                        }
                      },
                      borderRadius: BorderRadius.circular(12),
                      child: Row(
                        children: [
                          Container(
                            padding: const EdgeInsets.all(4),
                            decoration: BoxDecoration(color: BcColors.grayLight, borderRadius: BorderRadius.circular(8)),
                            child: Row(
                              children: [
                                Container(
                                  padding: const EdgeInsets.all(8),
                                  decoration: BoxDecoration(color: BcColors.black, borderRadius: BorderRadius.circular(6)),
                                  child: const Icon(Icons.person_outline, color: Colors.white, size: 18),
                                ),
                                Padding(
                                  padding: const EdgeInsets.symmetric(horizontal: 10),
                                  child: Column(
                                    crossAxisAlignment: CrossAxisAlignment.start,
                                    children: [
                                      const Text('Pessoal', style: TextStyle(fontWeight: FontWeight.w600, fontSize: 13)),
                                      Text(_paymentLabel, style: PassengerTheme.caption.copyWith(fontSize: 12)),
                                    ],
                                  ),
                                ),
                              ],
                            ),
                          ),
                          const Spacer(),
                          const Icon(Icons.chevron_right, color: BcColors.gray),
                        ],
                      ),
                    ),
                  ),
                  Padding(
                    padding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
                    child: Row(
                      children: [
                        Expanded(
                          child: FilledButton(
                            onPressed: _requesting ? null : _requestRide,
                            style: FilledButton.styleFrom(
                              backgroundColor: BcColors.black,
                              padding: const EdgeInsets.symmetric(vertical: 16),
                              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                            ),
                            child: _requesting
                                ? const SizedBox(height: 22, width: 22, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                                : Text(
                                    widget.trip.scheduled ? 'Agendar ${_selected.name}' : 'Escolher ${_selected.name}',
                                    style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 16),
                                  ),
                          ),
                        ),
                        const SizedBox(width: 10),
                        OutlinedButton(
                          onPressed: () async {
                            final dt = await showScheduleTimeSheet(context);
                            if (dt != null && context.mounted) {
                              ScaffoldMessenger.of(context).showSnackBar(
                                SnackBar(content: Text('Corrida agendada para ${dt.day}/${dt.month} às ${dt.hour}:${dt.minute.toString().padLeft(2, '0')}')),
                              );
                            }
                          },
                          style: OutlinedButton.styleFrom(
                            padding: const EdgeInsets.all(16),
                            side: const BorderSide(color: BcColors.border),
                            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                          ),
                          child: const Icon(Icons.event_outlined),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}
