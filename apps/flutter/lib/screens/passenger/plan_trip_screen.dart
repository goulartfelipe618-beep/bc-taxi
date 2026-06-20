import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../constants/passenger_data.dart';
import '../../models/trip_draft.dart';
import '../../services/auth_service.dart';
import '../../services/mapbox_service.dart';
import '../../services/trip_resolver.dart';
import '../../theme/passenger_theme.dart';
import '../../widgets/passenger/bc_widgets.dart';
import 'passenger_routes.dart';
import 'widgets/add_stops_sheet.dart';
import 'widgets/passenger_sheets.dart';
import 'widgets/place_autocomplete_sheet.dart';

class PlanTripScreen extends StatefulWidget {
  const PlanTripScreen({super.key, this.initialDestination, this.preselectedCategoryId});

  final String? initialDestination;
  final String? preselectedCategoryId;

  @override
  State<PlanTripScreen> createState() => _PlanTripScreenState();
}

class _PlanTripScreenState extends State<PlanTripScreen> {
  late MapPlace _originPlace = MapPlace(
    id: 'default-origin',
    label: defaultOrigin,
    address: defaultOrigin,
    lat: defaultPickupLat,
    lng: defaultPickupLng,
  );
  MapPlace? _destinationPlace;
  String _pickupLabel = 'Recolher agora';
  String _profileLabel = 'Para mim';
  final List<MapPlace> _stops = [];
  bool _navigating = false;
  List<MapPlace> _recentPlaces = [];
  List<SavedPlace> _savedPlaces = [];
  bool _loadingRecent = true;
  bool _loadingSaved = true;

  @override
  void initState() {
    super.initState();
    if (widget.initialDestination != null) {
      _destinationPlace = MapPlace(
        id: 'initial-dest',
        label: widget.initialDestination!,
        address: widget.initialDestination!,
        lat: defaultDropoffLat,
        lng: defaultDropoffLng,
      );
    }
    WidgetsBinding.instance.addPostFrameCallback((_) => _loadPlaces());
  }

  Future<void> _loadPlaces() async {
    final token = context.read<AuthService>().token;
    final results = await Future.wait([
      MapboxService.recentPlaces(token: token),
      MapboxService.savedPlaces(token: token),
    ]);
    if (!mounted) return;
    setState(() {
      _recentPlaces = results[0] as List<MapPlace>;
      _savedPlaces = results[1] as List<SavedPlace>;
      _loadingRecent = false;
      _loadingSaved = false;
    });
  }

  IconData _savedIcon(String placeType) {
    switch (placeType) {
      case 'home':
        return Icons.home_outlined;
      case 'work':
        return Icons.work_outline;
      default:
        return Icons.star_outline;
    }
  }

  Future<void> _configureSavedPlace(String placeType, String title) async {
    final token = context.read<AuthService>().token;
    if (token == null) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Inicie sessão para guardar locais')),
      );
      return;
    }

    final result = await showPlaceAutocompleteSheet(context, title: title, hint: 'Buscar endereço');
    if (result == null) return;

    final ok = await MapboxService.savePlace(token: token, placeType: placeType, place: result);
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content: Text(ok ? 'Local guardado' : 'Não foi possível guardar')),
    );
    if (ok) _loadPlaces();
  }

  Future<void> _confirmAndNavigate(MapPlace pickup, MapPlace dropoff) async {
    if (_navigating) return;
    setState(() => _navigating = true);

    final token = context.read<AuthService>().token;
    await MapboxService.confirmPlace(pickup, token: token);
    await MapboxService.confirmPlace(dropoff, token: token);
    for (final stop in _stops) {
      await MapboxService.confirmPlace(stop, token: token);
    }

    final trip = await TripResolver.buildFromMapPlaces(pickup: pickup, dropoff: dropoff, stops: _stops);
    if (!mounted) return;
    setState(() => _navigating = false);
    PassengerRoutes.openConfirmPickup(
      context,
      trip: trip,
      preselectedCategoryId: widget.preselectedCategoryId,
    );
    _loadPlaces();
  }

  Future<void> _goToChooseRide(PlaceItem place) async {
    if (_navigating) return;
    setState(() => _navigating = true);
    final trip = await TripResolver.build(
      pickupAddress: _originPlace.address,
      dropoffName: place.name,
      dropoffAddress: place.address,
    );
    if (!mounted) return;
    setState(() => _navigating = false);
    PassengerRoutes.openConfirmPickup(
      context,
      trip: trip,
      preselectedCategoryId: widget.preselectedCategoryId,
    );
  }

  Future<void> _goToChooseRideFromMapPlace(MapPlace dropoff) async {
    setState(() => _destinationPlace = dropoff);
    await _confirmAndNavigate(_originPlace, dropoff);
  }

  Future<void> _editOrigin() async {
    final result = await showPlaceAutocompleteSheet(
      context,
      title: 'Origem',
      initial: _originPlace.label,
      hint: 'Endereço de recolha',
    );
    if (result != null) setState(() => _originPlace = result);
  }

  Future<void> _editDestination() async {
    final result = await showPlaceAutocompleteSheet(
      context,
      title: 'Destino',
      initial: _destinationPlace?.label ?? '',
      hint: 'Para onde?',
    );
    if (result != null) await _goToChooseRideFromMapPlace(result);
  }

  Future<void> _addStop() async {
    final result = await showAddStopsSheet(
      context,
      origin: _originPlace,
      stops: _stops,
      destination: _destinationPlace,
    );
    if (result == null) return;
    setState(() {
      _originPlace = result.origin;
      _stops
        ..clear()
        ..addAll(result.stops);
      _destinationPlace = result.destination;
    });
    if (result.destination != null) {
      await _confirmAndNavigate(result.origin, result.destination!);
    }
  }

  @override
  Widget build(BuildContext context) {
    final destinationLabel = _destinationPlace?.label ?? widget.initialDestination ?? 'Para onde?';
    final hasDestination = _destinationPlace != null || widget.initialDestination != null;

    return Scaffold(
      appBar: AppBar(
        backgroundColor: Colors.white,
        foregroundColor: BcColors.black,
        elevation: 0,
        leading: IconButton(icon: const Icon(Icons.arrow_back), onPressed: () => Navigator.pop(context)),
        title: const Text('Planeie a sua viagem', style: TextStyle(fontWeight: FontWeight.w700, fontSize: 18)),
        centerTitle: true,
      ),
      body: Stack(
        children: [
          ListView(
            padding: const EdgeInsets.all(16),
            children: [
              Row(
                children: [
                  BcPillButton(
                    icon: Icons.access_time,
                    label: _pickupLabel,
                    onTap: () async {
                      if (_pickupLabel == 'Recolher agora') {
                        final choice = await showPickupTimeSheet(context, _pickupLabel);
                        if (choice == 'Recolher mais tarde') {
                          if (!context.mounted) return;
                          PassengerRoutes.openSchedule(context);
                        }
                      } else {
                        final choice = await showPickupTimeSheet(context, _pickupLabel);
                        if (choice != null) setState(() => _pickupLabel = choice);
                      }
                    },
                  ),
                  const SizedBox(width: 10),
                  BcPillButton(
                    icon: Icons.person_outline,
                    label: _profileLabel,
                    onTap: () async {
                      final choice = await showProfilePickerSheet(context, _profileLabel);
                      if (choice != null) setState(() => _profileLabel = choice);
                    },
                  ),
                ],
              ),
              const SizedBox(height: 20),
              Container(
                padding: const EdgeInsets.fromLTRB(16, 12, 8, 12),
                decoration: BoxDecoration(
                  border: Border.all(color: BcColors.black, width: 1.5),
                  borderRadius: BorderRadius.circular(12),
                ),
                child: Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Column(
                      children: [
                        Container(width: 10, height: 10, decoration: const BoxDecoration(color: BcColors.black, shape: BoxShape.circle)),
                        Container(width: 2, height: 36 + (_stops.length * 28), color: BcColors.black),
                        Container(width: 10, height: 10, decoration: BoxDecoration(border: Border.all(color: BcColors.black, width: 2))),
                      ],
                    ),
                    const SizedBox(width: 14),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          InkWell(
                            onTap: _editOrigin,
                            child: Text(_originPlace.label, style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 15)),
                          ),
                          ..._stops.map(
                            (s) => Padding(
                              padding: const EdgeInsets.only(top: 8),
                              child: Text(s.label, style: PassengerTheme.caption.copyWith(fontWeight: FontWeight.w500)),
                            ),
                          ),
                          const SizedBox(height: 18),
                          InkWell(
                            onTap: _editDestination,
                            child: Text(
                              destinationLabel,
                              style: TextStyle(
                                fontSize: 15,
                                fontWeight: hasDestination ? FontWeight.w600 : FontWeight.w400,
                                color: hasDestination ? BcColors.black : BcColors.gray,
                              ),
                            ),
                          ),
                        ],
                      ),
                    ),
                    IconButton(
                      onPressed: _addStop,
                      tooltip: 'Adicionar paragens',
                      icon: const Icon(Icons.add_circle_outline),
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 16),
              BcSearchBar(hint: 'Buscar destino no Mapbox', onTap: _editDestination),
              const SizedBox(height: 24),
              Row(
                children: [
                  const Icon(Icons.star_outline, size: 20),
                  const SizedBox(width: 8),
                  Text('Locais guardados', style: PassengerTheme.titleMedium.copyWith(fontSize: 16)),
                ],
              ),
              const Divider(height: 24),
              Row(
                children: [
                  Expanded(
                    child: OutlinedButton.icon(
                      onPressed: () => _configureSavedPlace('home', 'Definir casa'),
                      icon: const Icon(Icons.home_outlined, size: 18),
                      label: const Text('Casa'),
                    ),
                  ),
                  const SizedBox(width: 8),
                  Expanded(
                    child: OutlinedButton.icon(
                      onPressed: () => _configureSavedPlace('work', 'Definir trabalho'),
                      icon: const Icon(Icons.work_outline, size: 18),
                      label: const Text('Trabalho'),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 12),
              if (_loadingSaved)
                const Padding(
                  padding: EdgeInsets.symmetric(vertical: 8),
                  child: LinearProgressIndicator(minHeight: 2, color: BcColors.black),
                )
              else if (_savedPlaces.isNotEmpty)
                ..._savedPlaces.map(
                  (p) => PlaceListTile(
                    name: p.label,
                    address: p.address,
                    leading: _savedIcon(p.placeType),
                    onTap: () => _goToChooseRideFromMapPlace(p.toMapPlace()),
                  ),
                )
              else
                ...savedPlaces.map(
                  (p) => PlaceListTile(name: p.name, address: p.address, leading: Icons.star_outline, onTap: () => _goToChooseRide(p)),
                ),
              const Divider(height: 24),
              Row(
                children: [
                  const Icon(Icons.history, size: 20),
                  const SizedBox(width: 8),
                  Text('Recentes', style: PassengerTheme.titleMedium.copyWith(fontSize: 16)),
                ],
              ),
              const Divider(height: 24),
              if (_loadingRecent)
                const Padding(
                  padding: EdgeInsets.symmetric(vertical: 8),
                  child: LinearProgressIndicator(minHeight: 2, color: BcColors.black),
                )
              else if (_recentPlaces.isNotEmpty)
                ..._recentPlaces.map(
                  (p) => PlaceListTile(
                    name: p.label,
                    address: p.address,
                    onTap: () => _goToChooseRideFromMapPlace(p),
                  ),
                )
              else
                ...recentPlaces.map(
                  (p) => PlaceListTile(name: p.name, address: p.address, distanceKm: p.distanceKm, onTap: () => _goToChooseRide(p)),
                ),
            ],
          ),
          if (_navigating)
            const ColoredBox(
              color: Color(0x44FFFFFF),
              child: Center(child: CircularProgressIndicator(color: BcColors.black)),
            ),
        ],
      ),
    );
  }
}
