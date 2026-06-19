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
    this.description,
    this.requiresScheduling = false,
  });

  final String id;
  final String name;
  final int capacity;
  final String priceLabel;
  final String etaLabel;
  final String? badge;
  final bool badgeIsGreen;
  final String? description;
  final bool requiresScheduling;
}

class PickupSpot {
  const PickupSpot({required this.label, required this.subtitle});

  final String label;
  final String subtitle;
}

class TripActivityItem {
  const TripActivityItem({
    required this.destination,
    required this.address,
    required this.dateLabel,
    required this.priceLabel,
    this.origin = defaultOrigin,
    this.category = 'BC Taxi',
    this.paymentMethod = 'PIX',
    this.driverName,
    this.metaLabel,
    this.failed = false,
    this.featured = false,
  });

  final String destination;
  final String address;
  final String dateLabel;
  final String priceLabel;
  final String origin;
  final String category;
  final String paymentMethod;
  final String? driverName;
  final String? metaLabel;
  final bool failed;
  final bool featured;

  String get displayTitle => featured ? '$origin - $address' : destination;
}

class VehicleService {
  const VehicleService({
    required this.id,
    required this.label,
    required this.icon,
    this.categoryId,
  });

  final String id;
  final String label;
  final IconData icon;
  final String? categoryId;
}

class MockUser {
  const MockUser({
    required this.name,
    required this.email,
    required this.phone,
    required this.gender,
    required this.rating,
    required this.walletBalance,
    required this.passwordChangedLabel,
  });

  final String name;
  final String email;
  final String phone;
  final String gender;
  final double rating;
  final double walletBalance;
  final String passwordChangedLabel;
}

class AccountMenuItem {
  const AccountMenuItem({
    required this.id,
    required this.title,
    required this.icon,
    this.subtitle,
    this.badge,
  });

  final String id;
  final String title;
  final IconData icon;
  final String? subtitle;
  final String? badge;
}

class PaymentMethodItem {
  const PaymentMethodItem({
    required this.id,
    required this.label,
    required this.icon,
    this.subtitle,
    this.isDefault = false,
  });

  final String id;
  final String label;
  final IconData icon;
  final String? subtitle;
  final bool isDefault;
}

class WalletTransaction {
  const WalletTransaction({required this.title, required this.dateLabel, required this.amountLabel});

  final String title;
  final String dateLabel;
  final String amountLabel;
}

class MockMessage {
  const MockMessage({
    required this.title,
    required this.preview,
    required this.body,
    required this.timeLabel,
    required this.icon,
  });

  final String title;
  final String preview;
  final String body;
  final String timeLabel;
  final IconData icon;
}

class LoginSession {
  const LoginSession({required this.device, required this.location, required this.platform});

  final String device;
  final String location;
  final String platform;
}

const mockUser = MockUser(
  name: 'Felipe Goulart',
  email: 'felipe.goulart@email.com',
  phone: '+55 47 98820-5126',
  gender: 'Homem',
  rating: 4.93,
  walletBalance: 42.50,
  passwordChangedLabel: '7 de agosto de 2024',
);

const defaultOrigin = 'Rua Pedro Pinto Felipe, 87';

const pickupSpots = [
  PickupSpot(label: 'Rua Pedro Pinto Felipe - Lugar n.º1', subtitle: 'Perto de Rua Pedro Pinto Felipe, 87'),
  PickupSpot(label: 'Rua Pedro Pinto Felipe - Lugar n.º2', subtitle: 'Perto de Rua Pedro Pinto Felipe, 87'),
  PickupSpot(label: 'Rua Pedro Pinto Felipe - Lugar n.º3', subtitle: 'Entrada lateral do edifício'),
];

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
    id: 'economico',
    name: 'Econômico',
    capacity: 4,
    priceLabel: 'R\$ 17,44',
    etaLabel: '4 min · chegada em 6 min',
    badge: 'Mais rápido',
    description: 'Corridas económicas do dia a dia',
  ),
  RideCategoryOption(
    id: 'comfort',
    name: 'Comfort',
    capacity: 4,
    priceLabel: 'R\$ 22,90',
    etaLabel: '7 min · chegada em 9 min',
    badge: 'Boa oferta',
    badgeIsGreen: true,
    description: 'Veículos mais recentes e confortáveis',
  ),
  RideCategoryOption(
    id: 'executivo',
    name: 'Executivo',
    capacity: 4,
    priceLabel: 'R\$ 25,20',
    etaLabel: '8 min · chegada em 11 min',
    description: 'Atendimento premium',
  ),
  RideCategoryOption(
    id: 'suv',
    name: 'SUV',
    capacity: 6,
    priceLabel: 'R\$ 28,50',
    etaLabel: '10 min · chegada em 14 min',
    description: 'Ideal para grupos e bagagem extra',
  ),
  RideCategoryOption(
    id: 'compartilhado',
    name: 'Compartilhado',
    capacity: 2,
    priceLabel: 'R\$ 14,20',
    etaLabel: '12 min · chegada em 18 min',
    description: 'Espere um pouco mais e pague menos',
  ),
];

const pastTrips = [
  TripActivityItem(
    destination: 'Hotel Blumenau',
    address: 'Da Barra',
    dateLabel: '19/06 · 04:45',
    priceLabel: 'R\$ 14,58',
    driverName: 'Carlos M.',
    metaLabel: '2 motoristas',
    featured: true,
  ),
  TripActivityItem(
    destination: 'Rua 2500, 910',
    address: 'Centro, Balneário Camboriú',
    dateLabel: '19/06 · 02:38',
    priceLabel: 'R\$ 9,99',
    driverName: 'Ana P.',
  ),
  TripActivityItem(
    destination: 'Edifício Italian Residence',
    address: 'Av. Brasil, 800 - Centro',
    dateLabel: '18/06 · 21:15',
    priceLabel: 'R\$ 11,20',
    driverName: 'Marcos T.',
  ),
  TripActivityItem(
    destination: 'Shopping Atlântico',
    address: 'Av. Atlântica, 2550',
    dateLabel: '08/06 · 14:22',
    priceLabel: 'R\$ 14,50',
    driverName: 'João S.',
  ),
  TripActivityItem(
    destination: 'Aeroporto Navegantes',
    address: 'Rod. Jorge Lacerda',
    dateLabel: '01/06 · 06:10',
    priceLabel: 'R\$ 0,00',
    failed: true,
  ),
];

const serviceGridPrimary = [
  VehicleService(id: 'travel', label: 'Viajar', icon: Icons.directions_car_filled_outlined, categoryId: 'economico'),
  VehicleService(id: 'comfort', label: 'Comfort', icon: Icons.airline_seat_recline_normal_outlined, categoryId: 'comfort'),
  VehicleService(id: 'suv', label: 'SUV', icon: Icons.airport_shuttle_outlined, categoryId: 'suv'),
];

const serviceGridSecondary = [
  VehicleService(id: 'reserve', label: 'Reservar', icon: Icons.event_outlined),
  VehicleService(id: 'compartilhado', label: 'Compartilhado', icon: Icons.schedule_outlined, categoryId: 'compartilhado'),
];

const vehicleServices = [
  VehicleService(id: 'travel', label: 'Viajar', icon: Icons.directions_car_filled_outlined, categoryId: 'economico'),
  VehicleService(id: 'reserve', label: 'Reservar', icon: Icons.event_outlined),
  VehicleService(id: 'comfort', label: 'Comfort', icon: Icons.airline_seat_recline_normal_outlined, categoryId: 'comfort'),
  VehicleService(id: 'suv', label: 'SUV', icon: Icons.airport_shuttle_outlined, categoryId: 'suv'),
];

const accountMenuItems = [
  AccountMenuItem(id: 'personal', title: 'Informações pessoais', icon: Icons.person_outline),
  AccountMenuItem(id: 'security', title: 'Segurança', icon: Icons.shield_outlined),
  AccountMenuItem(id: 'privacy', title: 'Privacidade e Dados', icon: Icons.lock_outline),
  AccountMenuItem(id: 'wallet', title: 'Pagamentos e carteira', icon: Icons.account_balance_wallet_outlined),
  AccountMenuItem(id: 'verification', title: 'Verificação de identidade', icon: Icons.badge_outlined),
  AccountMenuItem(
    id: 'driver',
    title: 'Conduza com a BC Taxi',
    icon: Icons.drive_eta_outlined,
    subtitle: 'Aumente os seus rendimentos a conduzir',
  ),
  AccountMenuItem(id: 'legal', title: 'Informações legais', icon: Icons.info_outline),
];

const paymentMethods = [
  PaymentMethodItem(id: 'pix', label: 'PIX', icon: Icons.pix, subtitle: 'Pagamento instantâneo', isDefault: true),
  PaymentMethodItem(id: 'cash', label: 'Dinheiro', icon: Icons.payments_outlined),
  PaymentMethodItem(id: 'card', label: 'Cartão •••• 4242', icon: Icons.credit_card, subtitle: 'Visa'),
];

const walletTransactions = [
  WalletTransaction(title: 'Corrida Hotel Blumenau', dateLabel: '19/06', amountLabel: '- R\$ 14,58'),
  WalletTransaction(title: 'Recarga PIX', dateLabel: '15/06', amountLabel: '+ R\$ 50,00'),
];

const helpTopics = [
  'Problema com uma viagem recente',
  'Alterar destino durante a corrida',
  'Pagamento recusado',
  'Objeto perdido no veículo',
  'Conta e dados pessoais',
];

const legalDocuments = [
  'Termos e Condições',
  'Política de Privacidade',
  'Licenças de software',
  'Avisos legais',
];

const mockMessages = [
  MockMessage(
    title: 'Promoção BC Taxi',
    preview: '10% de desconto na próxima corrida',
    body: 'Use o código BCTAXI10 na próxima viagem até domingo.',
    timeLabel: 'Ontem',
    icon: Icons.local_offer_outlined,
  ),
  MockMessage(
    title: 'Recibo da viagem',
    preview: 'Hotel Blumenau · R\$ 14,58',
    body: 'O recibo da sua viagem de 19/06 está disponível.',
    timeLabel: '19/06',
    icon: Icons.receipt_long_outlined,
  ),
];

const loginSessions = [
  LoginSession(device: 'Infinix X6852', location: 'Itajaí, Brasil', platform: 'BC Taxi App'),
  LoginSession(device: 'Telemóvel Android', location: 'Balneário Camboriú', platform: 'BC Taxi Web'),
  LoginSession(device: 'Desconhecido', location: 'São Paulo', platform: 'BC Taxi Web'),
];

const promoBanners = [
  'Poupe na sua viagem com BC Pass',
  'Experimente Conforto com preço especial',
];
