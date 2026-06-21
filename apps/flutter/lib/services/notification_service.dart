import 'api_client.dart';

class NotificationService {
  NotificationService(this._client);

  final ApiClient _client;

  Future<void> registerPushToken({
    required String platform,
    required String token,
  }) async {
    final res = await _client.post('/v1/notifications/push/register', body: {
      'platform': platform,
      'token': token,
    });
    final data = _client.decodeJson(res);
    _client.throwIfError(res, data);
  }
}

/// Token demo para desenvolvimento (substituir por FCM/Expo em produção).
String demoExpoPushToken(String userSuffix) => 'ExponentPushToken[bc-taxi-$userSuffix]';
