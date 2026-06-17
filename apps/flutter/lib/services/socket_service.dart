import 'package:socket_io_client/socket_io_client.dart' as io;
import '../config/api_config.dart';
import '../models/trip.dart';

class SocketService {
  io.Socket? _socket;
  void Function(Trip)? onTripUpdated;
  void Function(Trip)? onNewTripRequest;

  void connect(String token) {
    disconnect();
    _socket = io.io(
      ApiConfig.socketUrl,
      io.OptionBuilder()
          .setTransports(['websocket'])
          .disableAutoConnect()
          .setAuth({'token': token})
          .build(),
    );

    _socket!.on('trip_updated', (data) {
      if (data is Map<String, dynamic>) {
        onTripUpdated?.call(Trip.fromJson(data));
      }
    });

    _socket!.on('new_trip_request', (data) {
      if (data is Map<String, dynamic>) {
        onNewTripRequest?.call(Trip.fromJson(data));
      }
    });

    _socket!.connect();
  }

  void joinTrip(String tripId) {
    _socket?.emit('join_trip', tripId);
  }

  void leaveTrip(String tripId) {
    _socket?.emit('leave_trip', tripId);
  }

  void emitDriverLocation(double lat, double lng, double? heading) {
    _socket?.emit('driver_location', {
      'lat': lat,
      'lng': lng,
      if (heading != null) 'heading': heading,
    });
  }

  void disconnect() {
    _socket?.disconnect();
    _socket?.destroy();
    _socket = null;
  }
}
