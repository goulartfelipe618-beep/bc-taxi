class User {
  final String id;
  final String email;
  final String fullName;
  final String? phone;
  final String role;

  User({
    required this.id,
    required this.email,
    required this.fullName,
    this.phone,
    required this.role,
  });

  factory User.fromJson(Map<String, dynamic> json) => User(
        id: json['id'] as String,
        email: json['email'] as String,
        fullName: json['full_name'] as String,
        phone: json['phone'] as String?,
        role: json['role'] as String,
      );

  bool get isDriver => role == 'driver';
  bool get isPassenger => role == 'passenger';
}
