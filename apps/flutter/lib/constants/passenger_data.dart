import 'package:flutter/material.dart';

class PlaceItem {
  const PlaceItem({
    required this.name,
    required this.address,
    this.distanceKm,
  });

  final String name;
  final String address;
  final double? distanceKm;
}

class RideCategoryOption {
  const RideCategoryOption({
    required this.id,
    required this.name,
    required this.capacity,
    required this.priceLabel,
    required this.etaLabel,
    this.badge,
    this.badgeIsGreen = false,
  });

  final String id;
  final String name;
  final int capacity;
  final String priceLabel;
  final String etaLabel;
  final String? badge;
  final bool badgeIsGreen;
}

class TripActivityItem {
  const TripActivityItem({
    required this.destination,
    required this.address,
    required this.dateLabel,
    required this.priceLabel,
    this.failed = false,
  });

  final String destination;
  final String address;
  final String dateLabel;
  final String priceLabel;
  final bool failed;
}

class VehicleService {
  const VehicleService({required this.label, required this.icon});

  final String label;
  final IconData icon;
}

const defaultOrigin = 'Rua Pedro Pinto Felipe, 87';

const recentPlaces = [
  PlaceItem(
    name: 'Hotel Blumenau',
    address: 'R. Mil e Um, 129 - Centro, Balneário Camboriú',
    distanceKm: 7.0,
  ),
  PlaceItem(
    name: 'Shopping Atlântico',
    address: 'Av. Atlântica, 2550 - Centro, Balneário Camboriú',
    distanceKm: 4.2,
  ),
  PlaceItem(
    name: 'Rodoviária',
    address: 'Av. Marginal Oeste, 3000 - Estados, Balneário Camboriú',
    distanceKm: 9.5,
  ),
];

const savedPlaces = [
  PlaceItem(name: 'Casa', address: 'Rua Pedro Pinto Felipe, 87'),
  PlaceItem(name: 'Trabalho', address: 'Av. Brasil, 1200 - Centro'),
];

const rideCategories = [
  RideCategoryOption(
    id: 'economy',
    name: 'BC Taxi',
    capacity: 4,
    priceLabel: 'R\$ 17,44',
    etaLabel: '4 min · chegada em 6 min',
    badge: 'Mais rápido',
  ),
  RideCategoryOption(
    id: 'comfort',
    name: 'Conforto',
    capacity: 4,
    priceLabel: 'R\$ 22,90',
    etaLabel: '7 min · chegada em 9 min',
    badge: 'Boa oferta',
    badgeIsGreen: true,
  ),
  RideCategoryOption(
    id: 'xl',
    name: 'BC XL',
    capacity: 6,
    priceLabel: 'R\$ 28,50',
    etaLabel: '8 min · chegada em 11 min',
  ),
  RideCategoryOption(
    id: 'wait_save',
    name: 'Espere e economize',
    capacity: 4,
    priceLabel: 'R\$ 14,20',
    etaLabel: '12 min · chegada em 18 min',
  ),
];

const pastTrips = [
  TripActivityItem(
    destination: 'Hotel Blumenau',
    address: 'R. Mil e Um, 129 - Centro',
    dateLabel: '12/06 · 19:57',
    priceLabel: 'R\$ 9,28',
  ),
  TripActivityItem(
    destination: 'Shopping Atlântico',
    address: 'Av. Atlântica, 2550',
    dateLabel: '08/06 · 14:22',
    priceLabel: 'R\$ 14,50',
  ),
  TripActivityItem(
    destination: 'Aeroporto Navegantes',
    address: 'Rod. Jorge Lacerda',
    dateLabel: '01/06 · 06:10',
    priceLabel: 'R\$ 0,00',
    failed: true,
  ),
];

const vehicleServices = [
  VehicleService(label: 'Viajar', icon: Icons.directions_car_filled_outlined),
  VehicleService(label: 'Reservar', icon: Icons.event_outlined),
  VehicleService(label: 'Conforto', icon: Icons.airline_seat_recline_normal_outlined),
  VehicleService(label: 'BC XL', icon: Icons.airport_shuttle_outlined),
];
