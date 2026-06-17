export const RECENT_LOCATIONS = [
  {
    id: '1',
    name: 'Hotel Blumenau',
    address: 'R. Mil e Um, 129 - Centro - Balneário Camboriú',
    distance: '7.0 km',
  },
  {
    id: '2',
    name: 'Rua Edmundo Kienast, 310',
    address: 'Fazenda - Itajaí',
    distance: '16 km',
  },
  {
    id: '3',
    name: 'POLO ESTÁCIO BALNEÁRIO CAMBORIU',
    address: 'Av. Brasil, 1000 - Centro',
    distance: '8.2 km',
  },
  {
    id: '4',
    name: 'Rua 1926, 498 - Centro',
    address: 'Balneário Camboriú',
    distance: '5.1 km',
  },
];

export const RIDE_OPTIONS = [
  {
    id: 'bcx',
    name: 'BC X',
    capacity: 4,
    eta: '5 min',
    arrival: '03:59',
    price: '17,44',
    badge: 'Mais rápido',
    badgeColor: '#276EF1',
  },
  {
    id: 'wait',
    name: 'Espere e poupe',
    capacity: 4,
    eta: '6 - 15 min',
    arrival: '04:09',
    price: '16,30',
  },
  {
    id: 'comfort',
    name: 'Conforto',
    capacity: 4,
    eta: '5 min',
    arrival: '04:00',
    price: '19,18',
    badge: 'Boa oferta',
    badgeColor: '#05944F',
  },
  {
    id: 'moto',
    name: 'Moto',
    capacity: 1,
    eta: '3 min',
    arrival: '03:57',
    price: '11,44',
  },
];

export const PAST_TRIPS = [
  {
    id: '1',
    address: 'Rua Pedro Pinto Felipe, 87 - Da Barra',
    date: '12/06 • 19:57',
    price: '9,28R$',
    type: 'BC X',
    status: 'completed',
  },
  {
    id: '2',
    address: 'Rua Pedro Pinto Felipe, 87 - Da B...',
    date: '12/06 • 19:36',
    price: '0,00R$ • Falhou',
    type: 'Moto',
    status: 'failed',
  },
  {
    id: '3',
    address: 'Hotel Blumenau',
    date: '11/06 • 14:20',
    price: '12,50R$',
    type: 'BC X',
    status: 'completed',
  },
];

export const HOME_SERVICES = [
  { id: 'ride', label: 'Viajar', icon: 'directions_car' as const },
  { id: 'food', label: 'iFood', icon: 'shopping_bag' as const, badge: 'Novo' },
  { id: 'reserve', label: 'Reservar', icon: 'event' as const },
  { id: 'moto', label: 'Moto', icon: 'two_wheeler' as const },
];

export const ACCOUNT_MENU = [
  { id: 'family', title: 'Família', subtitle: 'Gestão de contas de adolescentes e idosos', icon: 'groups' as const },
  { id: 'settings', title: 'Definições', icon: 'settings' as const },
  { id: 'wallet', title: 'Carteira', icon: 'account_balance_wallet' as const },
  { id: 'legal', title: 'Informações legais', icon: 'info' as const },
];

export const PICKUP_ADDRESS = 'Rua Pedro Pinto Felipe, 87';
