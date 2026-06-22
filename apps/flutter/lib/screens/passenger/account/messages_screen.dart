import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../../constants/passenger_data.dart';
import '../../../services/api_client.dart';
import '../../../services/auth_service.dart';
import '../../../services/passenger_account_service.dart';
import '../../../theme/passenger_theme.dart';
import '../../../widgets/passenger/bc_subpage_scaffold.dart';

class MessagesScreen extends StatefulWidget {
  const MessagesScreen({super.key});

  @override
  State<MessagesScreen> createState() => _MessagesScreenState();
}

class _MessagesScreenState extends State<MessagesScreen> {
  List<PassengerInboxMessage> _messages = [];
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    final token = context.read<AuthService>().token;
    if (token == null) {
      _useFallback();
      return;
    }
    try {
      final messages = await PassengerAccountService(ApiClient(token)).fetchMessages();
      if (!mounted) return;
      setState(() {
        _messages = messages;
        _loading = false;
      });
    } catch (_) {
      _useFallback();
    }
  }

  void _useFallback() {
    if (!mounted) return;
    setState(() {
      _messages = mockMessages
          .map(
            (m) => PassengerInboxMessage(
              id: m.title,
              title: m.title,
              preview: m.preview,
              body: m.body,
              iconType: 'info',
              isRead: true,
              createdAt: DateTime.now().toIso8601String(),
            ),
          )
          .toList();
      _loading = false;
    });
  }

  IconData _iconFor(String type) {
    switch (type) {
      case 'promo':
        return Icons.local_offer_outlined;
      case 'ride':
        return Icons.directions_car_outlined;
      default:
        return Icons.notifications_outlined;
    }
  }

  Future<void> _openMessage(PassengerInboxMessage message) async {
    final token = context.read<AuthService>().token;
    if (token != null && !message.isRead) {
      try {
        await PassengerAccountService(ApiClient(token)).markMessageRead(message.id);
      } catch (_) {}
    }
    if (!mounted) return;
    await showDialog(
      context: context,
      builder: (ctx) => AlertDialog(title: Text(message.title), content: Text(message.body)),
    );
    if (token != null) _load();
  }

  @override
  Widget build(BuildContext context) {
    return BcSubpageScaffold(
      title: 'Mensagens',
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : ListView(
              children: _messages.map((m) {
                return ListTile(
                  leading: CircleAvatar(child: Icon(_iconFor(m.iconType))),
                  title: Text(m.title, style: TextStyle(fontWeight: m.isRead ? FontWeight.w500 : FontWeight.w700)),
                  subtitle: Text(m.preview, maxLines: 1, overflow: TextOverflow.ellipsis),
                  trailing: Text(m.createdAt.substring(0, 10), style: PassengerTheme.caption),
                  onTap: () => _openMessage(m),
                );
              }).toList(),
            ),
    );
  }
}
