import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../services/api_client.dart';
import '../services/auth_service.dart';
import '../services/driver_fleet_service.dart';

class DriverComplianceScreen extends StatefulWidget {
  const DriverComplianceScreen({super.key});

  @override
  State<DriverComplianceScreen> createState() => _DriverComplianceScreenState();
}

class _DriverComplianceScreenState extends State<DriverComplianceScreen> {
  DriverCompliance? _compliance;
  bool _loading = true;
  String? _error;
  bool _submitting = false;

  @override
  void initState() {
    super.initState();
    _load();
  }

  DriverFleetService? get _fleet {
    final token = context.read<AuthService>().token;
    if (token == null) return null;
    return DriverFleetService(ApiClient(token));
  }

  Future<void> _load() async {
    final fleet = _fleet;
    if (fleet == null) return;
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final c = await fleet.fetchCompliance();
      if (!mounted) return;
      setState(() {
        _compliance = c;
        _loading = false;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _error = e.toString();
        _loading = false;
      });
    }
  }

  Future<void> _quickSetupDemo() async {
    final fleet = _fleet;
    if (fleet == null) return;
    setState(() => _submitting = true);
    try {
      await fleet.registerVehicle(
        plate: 'ABC1D23',
        make: 'Volkswagen',
        model: 'Gol',
        year: 2021,
        categoryCodes: const ['economico', 'comfort'],
      );
      final exp = DateTime.now().add(const Duration(days: 730)).toIso8601String().substring(0, 10);
      await fleet.submitDriverDocument(docType: 'CNH', expiresAt: exp);
      await fleet.submitDriverDocument(docType: 'EAR_PROOF', expiresAt: exp);
      final vehicleId = await fleet.fetchPrimaryVehicleId();
      await fleet.submitVehicleDocument(vehicleId: vehicleId, docType: 'CRLV', expiresAt: exp);
      await fleet.submitVehicleDocument(vehicleId: vehicleId, docType: 'INSURANCE', expiresAt: exp);
      await _load();
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.toString())));
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Veículo e documentos'),
        actions: [
          IconButton(onPressed: _load, icon: const Icon(Icons.refresh)),
        ],
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : _error != null
              ? Center(child: Text(_error!))
              : ListView(
                  padding: const EdgeInsets.all(16),
                  children: [
                    _StatusCard(compliance: _compliance!),
                    const SizedBox(height: 16),
                    if (_compliance!.blockReasons.isNotEmpty) ...[
                      const Text('Pendências', style: TextStyle(fontWeight: FontWeight.w700, fontSize: 16)),
                      const SizedBox(height: 8),
                      ..._compliance!.blockReasons.map((r) => ListTile(
                            leading: const Icon(Icons.warning_amber_outlined, color: Colors.orange),
                            title: Text(r),
                          )),
                      const SizedBox(height: 16),
                    ],
                    const Text('Documentos do motorista', style: TextStyle(fontWeight: FontWeight.w700, fontSize: 16)),
                    ..._compliance!.driverDocuments.map(
                      (d) => ListTile(
                        title: Text(d['docType'] as String),
                        subtitle: Text('${d['status']} · validade ${d['expiresAt'] ?? '—'}'),
                      ),
                    ),
                    const SizedBox(height: 16),
                    const Text('Documentos do veículo', style: TextStyle(fontWeight: FontWeight.w700, fontSize: 16)),
                    ..._compliance!.vehicleDocuments.map(
                      (d) => ListTile(
                        title: Text(d['docType'] as String),
                        subtitle: Text('${d['status']} · validade ${d['expiresAt'] ?? '—'}'),
                      ),
                    ),
                    const SizedBox(height: 24),
                    FilledButton.icon(
                      onPressed: _submitting ? null : _quickSetupDemo,
                      icon: _submitting
                          ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2))
                          : const Icon(Icons.upload_file),
                      label: const Text('Cadastrar veículo e documentos (demo)'),
                    ),
                  ],
                ),
    );
  }
}

class _StatusCard extends StatelessWidget {
  const _StatusCard({required this.compliance});

  final DriverCompliance compliance;

  @override
  Widget build(BuildContext context) {
    final ok = compliance.canOperate;
    return Card(
      color: ok ? Colors.green.shade50 : Colors.orange.shade50,
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Icon(ok ? Icons.check_circle : Icons.error_outline, color: ok ? Colors.green : Colors.orange),
                const SizedBox(width: 8),
                Text(ok ? 'Apto a operar' : 'Documentação incompleta', style: const TextStyle(fontWeight: FontWeight.w700)),
              ],
            ),
            if (compliance.activeVehiclePlate != null) ...[
              const SizedBox(height: 8),
              Text('Veículo: ${compliance.activeVehiclePlate}'),
            ],
            if (compliance.enabledCategories.isNotEmpty) ...[
              const SizedBox(height: 8),
              Text('Categorias: ${compliance.enabledCategories.join(', ')}'),
            ],
          ],
        ),
      ),
    );
  }
}
