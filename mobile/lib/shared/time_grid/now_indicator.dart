import 'dart:async';

import 'package:flutter/material.dart';

import 'time_grid_metrics.dart';

/// Red current-time line + dot, updated each minute. Place inside a Stack.
class NowIndicator extends StatefulWidget {
  const NowIndicator({super.key});

  @override
  State<NowIndicator> createState() => _NowIndicatorState();
}

class _NowIndicatorState extends State<NowIndicator> {
  Timer? _timer;

  @override
  void initState() {
    super.initState();
    _timer = Timer.periodic(const Duration(minutes: 1), (_) {
      if (mounted) setState(() {});
    });
  }

  @override
  void dispose() {
    _timer?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final now = DateTime.now();
    final top = minutesToY(now.hour * 60 + now.minute) - 4;
    return Positioned(
      top: top,
      left: 0,
      right: 0,
      child: IgnorePointer(
        child: Row(
          children: [
            Container(
              width: 8,
              height: 8,
              decoration: const BoxDecoration(
                color: Color(0xFFEF4444),
                shape: BoxShape.circle,
              ),
            ),
            const Expanded(
              child: SizedBox(height: 1.5, child: ColoredBox(color: Color(0xFFEF4444))),
            ),
          ],
        ),
      ),
    );
  }
}
