import 'package:flutter/material.dart';

import '../../../services/mapbox_service.dart';
import '../../../theme/passenger_theme.dart';
import 'place_autocomplete_sheet.dart';

class AddStopsResult {
  const AddStopsResult({
    required this.origin,
    required this.stops,
    required this.destination,
  });

  final MapPlace origin;
  final List<MapPlace> stops;
  final MapPlace? destination;
}

Future<AddStopsResult?> showAddStopsSheet(
  BuildContext context, {
  required MapPlace origin,
  required List<MapPlace> stops,
  MapPlace? destination,
}) {
  return showModalBottomSheet<AddStopsResult>(
    context: context,
    isScrollControlled: true,
    backgroundColor: Colors.transparent,
    builder: (ctx) => _AddStopsSheet(origin: origin, stops: List.of(stops), destination: destination),
  );
}

class _AddStopsSheet extends StatefulWidget {
  const _AddStopsSheet({
    required this.origin,
    required this.stops,
    this.destination,
  });

  final MapPlace origin;
  final List<MapPlace> stops;
  final MapPlace? destination;

  @override
  State<_AddStopsSheet> createState() => _AddStopsSheetState();
}

class _AddStopsSheetState extends State<_AddStopsSheet> {
  late MapPlace _origin;
  late List<MapPlace> _stops;
  MapPlace? _destination;

  @override
  void initState() {
    super.initState();
    _origin = widget.origin;
    _stops = List.of(widget.stops);
    _destination = widget.destination;
  }

  bool get _canFinish => _destination != null;

  Future<void> _editOrigin() async {
    final result = await showPlaceAutocompleteSheet(context, title: 'Origem', initial: _origin.label);
    if (result != null) setState(() => _origin = result);
  }

  Future<void> _editStop(int index) async {
    final result = await showPlaceAutocompleteSheet(context, title: 'Paragem ${index + 1}', hint: 'Adicionar paragem');
    if (result != null) setState(() => _stops[index] = result);
  }

  Future<void> _addStop() async {
    final result = await showPlaceAutocompleteSheet(context, title: 'Nova paragem', hint: 'Adicionar paragem');
    if (result != null) setState(() => _stops.add(result));
  }

  Future<void> _editDestination() async {
    final result = await showPlaceAutocompleteSheet(
      context,
      title: 'Destino',
      initial: _destination?.label ?? '',
      hint: 'Para onde?',
    );
    if (result != null) setState(() => _destination = result);
  }

  void _removeStop(int index) => setState(() => _stops.removeAt(index));

  @override
  Widget build(BuildContext context) {
    final bottom = MediaQuery.of(context).viewInsets.bottom;
    return Padding(
      padding: EdgeInsets.only(bottom: bottom),
      child: Container(
        decoration: const BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.vertical(top: Radius.circular(16)),
        ),
        padding: const EdgeInsets.fromLTRB(16, 12, 16, 16),
        child: SafeArea(
          top: false,
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Center(
                child: Container(
                  width: 40,
                  height: 4,
                  margin: const EdgeInsets.only(bottom: 12),
                  decoration: BoxDecoration(color: BcColors.border, borderRadius: BorderRadius.circular(2)),
                ),
              ),
              Row(
                children: [
                  const Expanded(
                    child: Text('Adicionar paragens', style: TextStyle(fontWeight: FontWeight.w700, fontSize: 18)),
                  ),
                  IconButton(
                    icon: const Icon(Icons.close),
                    onPressed: () => Navigator.pop(context),
                  ),
                ],
              ),
              const SizedBox(height: 8),
              Container(
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: BcColors.grayLight,
                  borderRadius: BorderRadius.circular(12),
                ),
                child: Column(
                  children: [
                    _RouteRow(
                      icon: _RouteIcon.dot,
                      label: _origin.label,
                      onTap: _editOrigin,
                    ),
                    ...List.generate(_stops.length, (i) {
                      return _RouteRow(
                        icon: _RouteIcon.numbered(i + 1),
                        label: _stops[i].label,
                        onTap: () => _editStop(i),
                        onRemove: () => _removeStop(i),
                      );
                    }),
                    _RouteRow(
                      icon: _RouteIcon.add,
                      label: 'Adicionar paragem',
                      muted: true,
                      onTap: _addStop,
                    ),
                    _RouteRow(
                      icon: _RouteIcon.square,
                      label: _destination?.label ?? 'Destino',
                      muted: _destination == null,
                      onTap: _editDestination,
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 16),
              SizedBox(
                width: double.infinity,
                child: FilledButton(
                  onPressed: _canFinish
                      ? () => Navigator.pop(
                            context,
                            AddStopsResult(origin: _origin, stops: _stops, destination: _destination),
                          )
                      : null,
                  style: FilledButton.styleFrom(
                    backgroundColor: BcColors.black,
                    disabledBackgroundColor: BcColors.border,
                    minimumSize: const Size(double.infinity, 52),
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                  ),
                  child: const Text('Concluído', style: TextStyle(fontWeight: FontWeight.w700)),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

enum _RouteIconType { dot, numbered, add, square }

class _RouteIcon {
  const _RouteIcon._(this.type, [this.number]);

  final _RouteIconType type;
  final int? number;

  static const dot = _RouteIcon._(_RouteIconType.dot);
  static const add = _RouteIcon._(_RouteIconType.add);
  static const square = _RouteIcon._(_RouteIconType.square);
  static _RouteIcon numbered(int n) => _RouteIcon._(_RouteIconType.numbered, n);
}

class _RouteRow extends StatelessWidget {
  const _RouteRow({
    required this.icon,
    required this.label,
    required this.onTap,
    this.onRemove,
    this.muted = false,
  });

  final _RouteIcon icon;
  final String label;
  final VoidCallback onTap;
  final VoidCallback? onRemove;
  final bool muted;

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(8),
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: 10),
        child: Row(
          children: [
            SizedBox(width: 28, child: _IconWidget(icon: icon)),
            const SizedBox(width: 10),
            Expanded(
              child: Text(
                label,
                style: TextStyle(
                  fontSize: 15,
                  fontWeight: muted ? FontWeight.w400 : FontWeight.w600,
                  color: muted ? BcColors.gray : BcColors.black,
                ),
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
              ),
            ),
            if (onRemove != null)
              IconButton(
                icon: const Icon(Icons.close, size: 18, color: BcColors.gray),
                onPressed: onRemove,
                visualDensity: VisualDensity.compact,
              )
            else
              const Icon(Icons.drag_handle, color: BcColors.gray, size: 20),
          ],
        ),
      ),
    );
  }
}

class _IconWidget extends StatelessWidget {
  const _IconWidget({required this.icon});

  final _RouteIcon icon;

  @override
  Widget build(BuildContext context) {
    switch (icon.type) {
      case _RouteIconType.dot:
        return Container(
          width: 10,
          height: 10,
          decoration: const BoxDecoration(color: BcColors.black, shape: BoxShape.circle),
        );
      case _RouteIconType.numbered:
        return Container(
          width: 20,
          height: 20,
          alignment: Alignment.center,
          decoration: BoxDecoration(
            border: Border.all(color: BcColors.black, width: 2),
          ),
          child: Text('${icon.number}', style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w700)),
        );
      case _RouteIconType.add:
        return const Icon(Icons.add, size: 20, color: BcColors.black);
      case _RouteIconType.square:
        return Container(
          width: 12,
          height: 12,
          decoration: BoxDecoration(
            border: Border.all(color: BcColors.black, width: 2),
          ),
        );
    }
  }
}
