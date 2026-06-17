import 'package:flutter_test/flutter_test.dart';
import 'package:provider/provider.dart';
import 'package:bc_taxi/app.dart';
import 'package:bc_taxi/providers/auth_provider.dart';
import 'package:bc_taxi/providers/theme_provider.dart';
import 'package:bc_taxi/services/api_client.dart';

void main() {
  testWidgets('BC Taxi app loads', (WidgetTester tester) async {
    await tester.pumpWidget(
      MultiProvider(
        providers: [
          ChangeNotifierProvider(create: (_) => ThemeProvider()),
          ChangeNotifierProvider(create: (_) => AuthProvider(ApiClient())),
        ],
        child: const BcTaxiApp(),
      ),
    );

    expect(find.text('BC Taxi'), findsOneWidget);
  });
}
