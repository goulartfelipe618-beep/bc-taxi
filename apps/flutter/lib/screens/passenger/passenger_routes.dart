import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../constants/passenger_data.dart';
import '../../models/trip_draft.dart';
import '../../services/auth_service.dart';
import '../../services/trip_resolver.dart';
import 'account/account_hub_screen.dart';
import 'account/help_screen.dart';
import 'account/legal_screen.dart';
import 'account/messages_screen.dart';
import 'account/privacy_screen.dart';
import 'account/security_screen.dart';
import 'account/settings_screen.dart';
import 'account/verification_screen.dart';
import 'account/wallet_screen.dart';
import 'activity/activity_filter_sheet.dart';
import 'activity/trip_detail_screen.dart';
import 'choose_ride_screen.dart';
import 'confirm_pickup_screen.dart';
import 'payment/payment_methods_screen.dart';
import 'plan_trip_screen.dart';
import 'ride/ride_requested_screen.dart';
import 'schedule/schedule_ride_screen.dart';

class PaymentMethodSelection {
  const PaymentMethodSelection({required this.id, required this.label});

  final String id;
  final String label;
}

class PassengerRoutes {
  static void openPlanTrip(BuildContext context, {String? destination, String? preselectedCategoryId, bool schedule = false}) {
    if (schedule) {
      Navigator.of(context).push(MaterialPageRoute(builder: (_) => const ScheduleRideScreen()));
      return;
    }
    Navigator.of(context).push(
      MaterialPageRoute(
        builder: (_) => PlanTripScreen(
          initialDestination: destination,
          preselectedCategoryId: preselectedCategoryId,
        ),
      ),
    );
  }

  static void openConfirmPickup(
    BuildContext context, {
    required TripDraft trip,
    String? preselectedCategoryId,
  }) {
    Navigator.of(context).push(
      MaterialPageRoute(
        builder: (_) => ConfirmPickupScreen(
          trip: trip,
          preselectedCategoryId: preselectedCategoryId,
        ),
      ),
    );
  }

  static Future<void> openChooseRide(
    BuildContext context, {
    required PlaceItem destination,
    String origin = defaultOrigin,
    String? preselectedCategoryId,
    bool scheduled = false,
    bool skipPickupConfirm = false,
  }) async {
    final trip = await TripResolver.build(
      pickupAddress: origin,
      dropoffName: destination.name,
      dropoffAddress: destination.address,
      scheduled: scheduled,
    );
    if (!context.mounted) return;
    if (!skipPickupConfirm) {
      openConfirmPickup(context, trip: trip, preselectedCategoryId: preselectedCategoryId);
      return;
    }
    Navigator.of(context).push(
      MaterialPageRoute(
        builder: (_) => ChooseRideScreen(
          trip: trip,
          preselectedCategoryId: preselectedCategoryId,
        ),
      ),
    );
  }

  static void rebookTrip(BuildContext context, TripActivityItem trip) {
    openChooseRide(
      context,
      origin: trip.origin,
      destination: PlaceItem(name: trip.destination, address: trip.address),
      skipPickupConfirm: true,
    );
  }

  static void openTripDetail(BuildContext context, TripActivityItem trip) {
    Navigator.of(context).push(MaterialPageRoute(builder: (_) => TripDetailScreen(trip: trip)));
  }

  static void openActivityFilter(BuildContext context) {
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.white,
      shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(16))),
      builder: (_) => const ActivityFilterSheet(),
    );
  }

  static void openAccountHub(BuildContext context, {int initialTab = 0}) {
    Navigator.of(context).push(MaterialPageRoute(builder: (_) => AccountHubScreen(initialTab: initialTab)));
  }

  static void openWallet(BuildContext context) => _push(context, const WalletScreen());
  static void openHelp(BuildContext context) => _push(context, const HelpScreen());
  static void openMessages(BuildContext context) => _push(context, const MessagesScreen());
  static void openSecurity(BuildContext context) => _push(context, const SecurityScreen());
  static void openPrivacy(BuildContext context) => _push(context, const PrivacyScreen());
  static void openSettings(BuildContext context) => _push(context, const SettingsScreen());
  static void openLegal(BuildContext context) => _push(context, const LegalScreen());
  static void openVerification(BuildContext context) => _push(context, const VerificationScreen());
  static Future<PaymentMethodSelection?> openPaymentMethods(BuildContext context) {
    return Navigator.of(context).push<PaymentMethodSelection>(
      MaterialPageRoute(builder: (_) => const PaymentMethodsScreen()),
    );
  }
  static void openSchedule(BuildContext context, {PlaceItem? destination}) =>
      Navigator.of(context).push(MaterialPageRoute(builder: (_) => ScheduleRideScreen(destination: destination)));

  static void openRideActive(
    BuildContext context, {
    required String rideId,
    required String category,
    required String destination,
    required String token,
  }) {
    Navigator.of(context).push(
      MaterialPageRoute(
        builder: (_) => RideActiveScreen(
          rideId: rideId,
          categoryName: category,
          destination: destination,
          token: token,
        ),
      ),
    );
  }

  /// @deprecated Use [openRideActive]
  static void openRideRequested(BuildContext context, {required String category, required String destination}) {
    final token = context.read<AuthService>().token;
    if (token == null) return;
    openRideActive(context, rideId: '', category: category, destination: destination, token: token);
  }

  static void _push(BuildContext context, Widget page) {
    Navigator.of(context).push(MaterialPageRoute(builder: (_) => page));
  }
}
