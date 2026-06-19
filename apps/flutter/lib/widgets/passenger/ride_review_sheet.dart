import 'package:flutter/material.dart';

import '../../theme/passenger_theme.dart';

class RideReviewResult {
  const RideReviewResult({required this.stars, this.comment});

  final int stars;
  final String? comment;
}

Future<RideReviewResult?> showRideReviewSheet(BuildContext context, {required String targetLabel}) {
  return showModalBottomSheet<RideReviewResult>(
    context: context,
    isScrollControlled: true,
    backgroundColor: Colors.white,
    shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(16))),
    builder: (ctx) => _RideReviewSheet(targetLabel: targetLabel),
  );
}

class _RideReviewSheet extends StatefulWidget {
  const _RideReviewSheet({required this.targetLabel});

  final String targetLabel;

  @override
  State<_RideReviewSheet> createState() => _RideReviewSheetState();
}

class _RideReviewSheetState extends State<_RideReviewSheet> {
  int _stars = 5;
  final _commentController = TextEditingController();

  @override
  void dispose() {
    _commentController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: EdgeInsets.only(
        left: 24,
        right: 24,
        top: 20,
        bottom: MediaQuery.of(context).viewInsets.bottom + 24,
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Center(
            child: Container(
              width: 40,
              height: 4,
              decoration: BoxDecoration(color: BcColors.border, borderRadius: BorderRadius.circular(2)),
            ),
          ),
          const SizedBox(height: 20),
          Text('Como foi a viagem?', style: PassengerTheme.titleMedium.copyWith(fontSize: 20)),
          const SizedBox(height: 6),
          Text('Avalie ${widget.targetLabel}', style: PassengerTheme.caption),
          const SizedBox(height: 20),
          Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: List.generate(5, (i) {
              final star = i + 1;
              return IconButton(
                onPressed: () => setState(() => _stars = star),
                icon: Icon(
                  star <= _stars ? Icons.star : Icons.star_border,
                  color: star <= _stars ? Colors.amber : BcColors.gray,
                  size: 40,
                ),
              );
            }),
          ),
          const SizedBox(height: 8),
          TextField(
            controller: _commentController,
            maxLines: 3,
            maxLength: 500,
            decoration: InputDecoration(
              hintText: 'Comentário opcional',
              border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
            ),
          ),
          const SizedBox(height: 12),
          FilledButton(
            onPressed: () {
              final comment = _commentController.text.trim();
              Navigator.pop(
                context,
                RideReviewResult(stars: _stars, comment: comment.isEmpty ? null : comment),
              );
            },
            style: FilledButton.styleFrom(
              backgroundColor: BcColors.black,
              padding: const EdgeInsets.symmetric(vertical: 16),
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
            ),
            child: const Text('Enviar avaliação', style: TextStyle(fontWeight: FontWeight.w700)),
          ),
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: const Text('Agora não'),
          ),
        ],
      ),
    );
  }
}
