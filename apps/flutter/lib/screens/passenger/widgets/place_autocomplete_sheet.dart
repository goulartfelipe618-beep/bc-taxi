import 'dart:async';

import 'package:flutter/material.dart';

import '../../../services/mapbox_service.dart';
import '../../../theme/passenger_theme.dart';

/// Sheet de busca com autocomplete Mapbox (debounce 350ms).
Future<MapPlace?> showPlaceAutocompleteSheet(
  BuildContext context, {
  required String title,
  String initial = '',
  String hint = 'Buscar endereço',
}) {
  return showModalBottomSheet<MapPlace>(
    context: context,
    isScrollControlled: true,
    backgroundColor: Colors.white,
    shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(16))),
    builder: (ctx) => _PlaceAutocompleteSheet(title: title, initial: initial, hint: hint),
  );
}

class _PlaceAutocompleteSheet extends StatefulWidget {
  const _PlaceAutocompleteSheet({
    required this.title,
    required this.initial,
    required this.hint,
  });

  final String title;
  final String initial;
  final String hint;

  @override
  State<_PlaceAutocompleteSheet> createState() => _PlaceAutocompleteSheetState();
}

class _PlaceAutocompleteSheetState extends State<_PlaceAutocompleteSheet> {
  late final TextEditingController _controller = TextEditingController(text: widget.initial);
  Timer? _debounce;
  List<MapPlace> _results = [];
  bool _loading = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    if (widget.initial.trim().length >= 2) {
      _search(widget.initial.trim());
    }
    _controller.addListener(_onTextChanged);
  }

  @override
  void dispose() {
    _debounce?.cancel();
    _controller.dispose();
    super.dispose();
  }

  void _onTextChanged() {
    _debounce?.cancel();
    final q = _controller.text.trim();
    if (q.length < 2) {
      setState(() {
        _results = [];
        _loading = false;
        _error = null;
      });
      return;
    }
    _debounce = Timer(const Duration(milliseconds: 350), () => _search(q));
  }

  Future<void> _search(String query) async {
    setState(() {
      _loading = true;
      _error = null;
    });
    final places = await MapboxService.autocomplete(query);
    if (!mounted) return;
    setState(() {
      _loading = false;
      _results = places;
      if (places.isEmpty) _error = 'Nenhum resultado encontrado';
    });
  }

  @override
  Widget build(BuildContext context) {
    final bottom = MediaQuery.of(context).viewInsets.bottom;

    return Padding(
      padding: EdgeInsets.only(left: 20, right: 20, top: 20, bottom: bottom + 20),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(widget.title, style: PassengerTheme.titleMedium),
          const SizedBox(height: 12),
          TextField(
            controller: _controller,
            autofocus: true,
            decoration: InputDecoration(
              hintText: widget.hint,
              prefixIcon: const Icon(Icons.search),
              border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
            ),
          ),
          const SizedBox(height: 12),
          if (_loading) const LinearProgressIndicator(minHeight: 2, color: BcColors.black),
          Flexible(
            child: ListView(
              shrinkWrap: true,
              children: [
                if (_error != null && !_loading)
                  Padding(
                    padding: const EdgeInsets.symmetric(vertical: 12),
                    child: Text(_error!, style: PassengerTheme.caption),
                  ),
                ..._results.map(
                  (p) => ListTile(
                    contentPadding: EdgeInsets.zero,
                    leading: const Icon(Icons.place_outlined),
                    title: Text(p.label, style: const TextStyle(fontWeight: FontWeight.w600)),
                    subtitle: Text(p.address, maxLines: 2, overflow: TextOverflow.ellipsis),
                    onTap: () => Navigator.pop(context, p),
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
