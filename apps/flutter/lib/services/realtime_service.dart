import 'dart:async';
import 'dart:convert';

import 'package:web_socket_channel/web_socket_channel.dart';

import '../config/api_config.dart';

typedef RealtimeHandler = void Function(Map<String, dynamic> event);

class RealtimeService {
  RealtimeService({required this.token});

  final String token;
  WebSocketChannel? _channel;
  StreamSubscription? _sub;
  final _handlers = <RealtimeHandler>[];

  static String wsUrl(String token) {
    final base = apiBaseUrl.replaceFirst('https://', 'wss://').replaceFirst('http://', 'ws://');
    return '$base/ws?token=${Uri.encodeComponent(token)}';
  }

  void addListener(RealtimeHandler handler) => _handlers.add(handler);
  void removeListener(RealtimeHandler handler) => _handlers.remove(handler);

  void connect() {
    disconnect();
    _channel = WebSocketChannel.connect(Uri.parse(wsUrl(token)));
    _sub = _channel!.stream.listen(
      (raw) {
        try {
          final msg = jsonDecode(raw as String) as Map<String, dynamic>;
          if (msg['type'] == 'event' && msg['event'] is Map) {
            final event = msg['event'] as Map<String, dynamic>;
            for (final h in List.of(_handlers)) {
              h(event);
            }
          }
        } catch (_) {}
      },
      onError: (_) => reconnectLater(),
      onDone: reconnectLater,
    );
  }

  void subscribeRide(String rideId) {
    _send({'type': 'subscribe_ride', 'rideId': rideId});
  }

  void ping() => _send({'type': 'ping'});

  void _send(Map<String, dynamic> msg) {
    final ch = _channel;
    if (ch == null) return;
    ch.sink.add(jsonEncode(msg));
  }

  void reconnectLater() {
    Future<void>.delayed(const Duration(seconds: 3), () {
      if (_handlers.isNotEmpty) connect();
    });
  }

  void disconnect() {
    _sub?.cancel();
    _sub = null;
    _channel?.sink.close();
    _channel = null;
  }
}

String? eventRideId(Map<String, dynamic> event) {
  return event['rideId'] as String? ?? event['aggregateId'] as String?;
}

String? eventType(Map<String, dynamic> event) => event['eventType'] as String?;

bool isRouteRecalculatedEvent(Map<String, dynamic> event) =>
    eventType(event) == 'ROUTE_RECALCULATED';

Map<String, dynamic>? routeRecalcPayload(Map<String, dynamic> event) {
  if (!isRouteRecalculatedEvent(event)) return null;
  final payload = event['payload'];
  if (payload is Map<String, dynamic>) return payload;
  return null;
}
