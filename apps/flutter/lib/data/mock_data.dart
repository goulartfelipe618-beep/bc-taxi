import 'package:flutter/material.dart';

class MockLocation {
  final String name;
  final String address;
  final String distance;

  const MockLocation({
    required this.name,
    required this.address,
    required this.distance,
  });
}

class MockRideOption {
  final String id;
  final String name;
  final int capacity;
  final String eta;
  final String arrival;
  final String price;
  final String? badge;
  final Color? badgeColor;

  const MockRideOption({
    required this.id,
    required this.name,
    required this.capacity,
    required this.eta,
    required this.arrival,
    required this.price,
    this.badge,
    this.badgeColor,
  });
}

const pickupAddress = 'Rua Pedro Pinto Felipe, 87';

const recentLocations = [
  MockLocation(
    name: 'Hotel Blumenau',
    address: 'R. Mil e Um, 129 - Centro - Balneário Camboriú',
    distance: '7.0 km',
  ),
  MockLocation(
    name: 'Rua Edmundo Kienast, 310',
    address: 'Fazenda - Itajaí',
    distance: '16 km',
  ),
  MockLocation(
    name: 'Rua 1926, 498 - Centro',
    address: 'Balneário Camboriú',
    distance: '5.1 km',
  ),
];

const rideOptions = [
  MockRideOption(
    id: 'bcx',
    name: 'BC X',
    capacity: 4,
    eta: '5 min',
    arrival: '03:59',
    price: '17,44',
    badge: 'Mais rápido',
    badgeColor: Color(0xFF276EF1),
  ),
  MockRideOption(
    id: 'wait',
    name: 'Espere e poupe',
    capacity: 4,
    eta: '6 - 15 min',
    arrival: '04:09',
    price: '16,30',
  ),
  MockRideOption(
    id: 'comfort',
    name: 'Conforto',
    capacity: 4,
    eta: '5 min',
    arrival: '04:00',
    price: '19,18',
    badge: 'Boa oferta',
    badgeColor: Color(0xFF05944F),
  ),
  MockRideOption(
    id: 'moto',
    name: 'Moto',
    capacity: 1,
    eta: '3 min',
    arrival: '03:57',
    price: '11,44',
  ),
];

const pastTrips = [
  {
    'address': 'Rua Pedro Pinto Felipe, 87 - Da Barra',
    'date': '12/06 • 19:57',
    'price': '9,28R\$',
    'type': 'BC X',
  },
  {
    'address': 'Rua Pedro Pinto Felipe, 87 - Da B...',
    'date': '12/06 • 19:36',
    'price': '0,00R\$ • Falhou',
    'type': 'Moto',
  },
];
