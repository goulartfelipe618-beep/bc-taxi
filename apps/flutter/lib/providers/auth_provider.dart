import 'package:flutter/foundation.dart';
import '../models/driver.dart';
import '../models/trip.dart';
import '../models/user.dart';
import '../services/api_client.dart';
import '../services/socket_service.dart';

class AuthProvider extends ChangeNotifier {
  final ApiClient _api;
  final SocketService _socket = SocketService();

  User? _user;
  bool _isLoading = true;
  String? _error;

  AuthProvider(this._api) {
    _init();
  }

  User? get user => _user;
  bool get isLoading => _isLoading;
  bool get isAuthenticated => _user != null;
  String? get error => _error;
  SocketService get socket => _socket;
  ApiClient get apiClient => _api;

  Future<void> _init() async {
    await _api.loadToken();
    if (_api.token != null) {
      try {
        final data = await _api.get('/auth/me');
        _user = User.fromJson(data['user'] as Map<String, dynamic>);
        _socket.connect(_api.token!);
      } catch (_) {
        await _api.setToken(null);
      }
    }
    _isLoading = false;
    notifyListeners();
  }

  Future<bool> login(String email, String password) async {
    _error = null;
    try {
      final data = await _api.post('/auth/login', {
        'email': email,
        'password': password,
      });
      final token = data['token'] as String;
      await _api.setToken(token);
      _user = User.fromJson(data['user'] as Map<String, dynamic>);
      _socket.connect(token);
      notifyListeners();
      return true;
    } catch (e) {
      _error = 'E-mail ou senha inválidos';
      notifyListeners();
      return false;
    }
  }

  Future<bool> register({
    required String email,
    required String password,
    required String fullName,
    required String role,
  }) async {
    _error = null;
    try {
      final data = await _api.post('/auth/register', {
        'email': email,
        'password': password,
        'fullName': fullName,
        'role': role,
      });
      final token = data['token'] as String;
      await _api.setToken(token);
      _user = User.fromJson(data['user'] as Map<String, dynamic>);
      _socket.connect(token);
      notifyListeners();
      return true;
    } catch (e) {
      _error = 'Erro ao criar conta';
      notifyListeners();
      return false;
    }
  }

  Future<void> logout() async {
    _socket.disconnect();
    await _api.setToken(null);
    _user = null;
    notifyListeners();
  }
}

// Trip service as extension methods on ApiClient usage
class TripService {
  final ApiClient _api;

  TripService(this._api);

  Future<List<Trip>> getTrips() async {
    final data = await _api.get('/trips');
    final list = data['trips'] as List<dynamic>;
    return list.map((t) => Trip.fromJson(t as Map<String, dynamic>)).toList();
  }

  Future<List<Trip>> getRequestedTrips() async {
    final data = await _api.get('/trips/requested');
    final list = data['trips'] as List<dynamic>;
    return list.map((t) => Trip.fromJson(t as Map<String, dynamic>)).toList();
  }

  Future<Trip?> getActiveTrip() async {
    final data = await _api.get('/trips/active');
    final trip = data['trip'];
    if (trip == null) return null;
    return Trip.fromJson(trip as Map<String, dynamic>);
  }

  Future<Trip> getTrip(String id) async {
    final data = await _api.get('/trips/$id');
    return Trip.fromJson(data['trip'] as Map<String, dynamic>);
  }

  Future<Map<String, double>> estimateFare({
    required double pickupLat,
    required double pickupLng,
    required double dropoffLat,
    required double dropoffLng,
  }) async {
    final data = await _api.post('/trips/estimate', {
      'pickup': {'lat': pickupLat, 'lng': pickupLng},
      'dropoff': {'lat': dropoffLat, 'lng': dropoffLng},
    });
    final estimates = data['estimates'] as Map<String, dynamic>;
    return estimates.map((k, v) => MapEntry(k, (v as num).toDouble()));
  }

  Future<Trip> createTrip({
    required double pickupLat,
    required double pickupLng,
    required double dropoffLat,
    required double dropoffLng,
    required String vehicleType,
    String? pickupAddress,
    String? dropoffAddress,
  }) async {
    final data = await _api.post('/trips', {
      'pickup': {'lat': pickupLat, 'lng': pickupLng},
      'dropoff': {'lat': dropoffLat, 'lng': dropoffLng},
      'vehicleType': vehicleType,
      if (pickupAddress != null) 'pickupAddress': pickupAddress,
      if (dropoffAddress != null) 'dropoffAddress': dropoffAddress,
    });
    return Trip.fromJson(data['trip'] as Map<String, dynamic>);
  }

  Future<Trip> acceptTrip(String tripId) async {
    final data = await _api.post('/trips/$tripId/accept', {});
    return Trip.fromJson(data['trip'] as Map<String, dynamic>);
  }

  Future<Trip> updateStatus(String tripId, String status,
      {String? cancellationReason}) async {
    final data = await _api.patch('/trips/$tripId/status', {
      'status': status,
      if (cancellationReason != null)
        'cancellationReason': cancellationReason,
    });
    return Trip.fromJson(data['trip'] as Map<String, dynamic>);
  }
}

class DriverService {
  final ApiClient _api;

  DriverService(this._api);

  Future<Driver> getMe() async {
    final data = await _api.get('/drivers/me');
    return Driver.fromJson(data['driver'] as Map<String, dynamic>);
  }

  Future<Driver> setOnline(bool isOnline) async {
    final data = await _api.patch('/drivers/online', {'isOnline': isOnline});
    return Driver.fromJson(data['driver'] as Map<String, dynamic>);
  }

  Future<void> updateLocation(double lat, double lng, double? heading) async {
    await _api.patch('/drivers/location', {
      'lat': lat,
      'lng': lng,
      if (heading != null) 'heading': heading,
    });
  }
}
