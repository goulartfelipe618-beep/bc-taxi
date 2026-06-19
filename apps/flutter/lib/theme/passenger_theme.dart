import 'package:flutter/material.dart';

class BcColors {
  static const black = Color(0xFF111111);
  static const gray = Color(0xFF6B6B6B);
  static const grayLight = Color(0xFFF3F3F3);
  static const border = Color(0xFFE5E5E5);
  static const blue = Color(0xFF276EF1);
  static const green = Color(0xFF05944F);
}

class PassengerTheme {
  static TextStyle get titleLarge => const TextStyle(
        fontSize: 28,
        fontWeight: FontWeight.w700,
        color: BcColors.black,
        letterSpacing: -0.5,
      );

  static TextStyle get titleMedium => const TextStyle(
        fontSize: 18,
        fontWeight: FontWeight.w600,
        color: BcColors.black,
      );

  static TextStyle get body => const TextStyle(fontSize: 15, color: BcColors.black);

  static TextStyle get caption => const TextStyle(fontSize: 13, color: BcColors.gray);

  static BoxDecoration get card => BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: BcColors.border),
      );

  static BoxDecoration get pillButton => BoxDecoration(
        color: BcColors.black,
        borderRadius: BorderRadius.circular(999),
      );
}
