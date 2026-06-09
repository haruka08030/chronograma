import 'package:flutter/material.dart';

import '../../design/app_colors.dart';
import 'now_indicator.dart';
import 'time_block.dart';
import 'time_grid_metrics.dart';

export 'now_indicator.dart';
export 'time_block.dart';
export 'time_grid_metrics.dart';

/// One column of a [TimeGrid] (a single day).
class TimeGridColumn {
  const TimeGridColumn({
    this.header,
    this.blocks = const [],
    this.isToday = false,
    this.highlighted = false,
    this.onTapEmptyMinutes,
    this.onAcceptTask,
  });

  final Widget? header;
  final List<TimeBlockData> blocks;
  final bool isToday;
  final bool highlighted;

  /// Called with snapped minutes-from-midnight when empty space is tapped.
  final void Function(int minutes)? onTapEmptyMinutes;

  /// Called when a dock task (id) is dropped at the snapped minutes.
  final void Function(String taskId, int minutes)? onAcceptTask;
}

/// A vertical 24-hour time grid with a left hour gutter and 1..7 day columns.
/// Used by the calendar week/day views and the activity log.
class TimeGrid extends StatefulWidget {
  const TimeGrid({
    super.key,
    required this.columns,
    this.initialHour = 7.5,
    this.compactBlocks = false,
  });

  final List<TimeGridColumn> columns;
  final double initialHour;
  final bool compactBlocks;

  @override
  State<TimeGrid> createState() => _TimeGridState();
}

class _TimeGridState extends State<TimeGrid> {
  late final ScrollController _controller;

  @override
  void initState() {
    super.initState();
    _controller = ScrollController(
      initialScrollOffset: widget.initialHour * kHourHeight,
    );
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final lineColor = isDark ? AppColors.zinc800 : AppColors.zinc100;
    final hasHeader = widget.columns.any((c) => c.header != null);

    return Column(
      children: [
        if (hasHeader)
          Row(
            children: [
              const SizedBox(width: kGutterWidth),
              for (final col in widget.columns)
                Expanded(child: col.header ?? const SizedBox.shrink()),
            ],
          ),
        Expanded(
          child: SingleChildScrollView(
            controller: _controller,
            child: SizedBox(
              height: kTimeGridHeight,
              width: double.infinity,
              child: Stack(
                children: [
                  Positioned.fill(
                    child: CustomPaint(
                      painter: _GridLinesPainter(
                        lineColor: lineColor,
                        halfColor: lineColor.withValues(alpha: 0.5),
                      ),
                    ),
                  ),
                  Positioned.fill(
                    child: Row(
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: [
                        _Gutter(isDark: isDark),
                        for (final col in widget.columns)
                          Expanded(
                            child: _ColumnBody(
                              column: col,
                              compactBlocks: widget.compactBlocks,
                            ),
                          ),
                      ],
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
      ],
    );
  }
}

class _Gutter extends StatelessWidget {
  const _Gutter({required this.isDark});
  final bool isDark;

  @override
  Widget build(BuildContext context) {
    final color = isDark ? AppColors.zinc500 : AppColors.zinc400;
    return SizedBox(
      width: kGutterWidth,
      child: Stack(
        children: [
          for (int h = 0; h < 24; h++)
            Positioned(
              top: h * kHourHeight - 6,
              right: 6,
              child: Text(
                hourLabel(h),
                style: TextStyle(fontSize: 11, color: color),
              ),
            ),
        ],
      ),
    );
  }
}

class _ColumnBody extends StatefulWidget {
  const _ColumnBody({required this.column, required this.compactBlocks});

  final TimeGridColumn column;
  final bool compactBlocks;

  @override
  State<_ColumnBody> createState() => _ColumnBodyState();
}

class _ColumnBodyState extends State<_ColumnBody> {
  String? _dragId;
  bool _resizing = false;
  double _dragDy = 0;

  int _deltaMinutes(double dy) => (dy / kHourHeight * 60).round();

  @override
  Widget build(BuildContext context) {
    final column = widget.column;
    final isDark = Theme.of(context).brightness == Brightness.dark;
    Color? bg;
    if (column.isToday) {
      bg = AppColors.accent500.withValues(alpha: isDark ? 0.08 : 0.05);
    } else if (column.highlighted) {
      bg = AppColors.accent500.withValues(alpha: isDark ? 0.12 : 0.07);
    }

    final stack = Stack(
      children: [
        if (bg != null) Positioned.fill(child: ColoredBox(color: bg)),
        DecoratedBox(
          decoration: BoxDecoration(
            border: Border(
              left: BorderSide(
                color: (isDark ? AppColors.zinc800 : AppColors.zinc100),
              ),
            ),
          ),
          child: const SizedBox.expand(),
        ),
        for (final block in column.blocks) _positionedBlock(block),
        if (column.isToday) const NowIndicator(),
      ],
    );

    final tappable = GestureDetector(
      behavior: HitTestBehavior.translucent,
      onTapUp: column.onTapEmptyMinutes == null
          ? null
          : (details) {
              final minutes = snapToSlot(yToMinutes(details.localPosition.dy));
              column.onTapEmptyMinutes!(minutes);
            },
      child: stack,
    );

    if (column.onAcceptTask == null) return tappable;

    return DragTarget<String>(
      onAcceptWithDetails: (details) {
        final box = context.findRenderObject() as RenderBox?;
        if (box == null) return;
        final local = box.globalToLocal(details.offset);
        final minutes = snapToSlot(yToMinutes(local.dy));
        column.onAcceptTask!(details.data, minutes);
      },
      builder: (context, candidate, rejected) => tappable,
    );
  }

  Widget _positionedBlock(TimeBlockData block) {
    final isActive = _dragId == block.id;
    var top = block.top;
    var height = block.height;
    if (isActive) {
      final deltaMin = _deltaMinutes(_dragDy);
      if (_resizing) {
        final newEnd =
            (block.endMinutes + deltaMin).clamp(block.startMinutes + kSnapMinutes, 24 * 60);
        height = (minutesToY(newEnd) - minutesToY(block.startMinutes))
            .clamp(kMinBlockHeight, kTimeGridHeight);
      } else {
        final newStart = (block.startMinutes + deltaMin)
            .clamp(0, 24 * 60 - (block.endMinutes - block.startMinutes));
        top = minutesToY(newStart);
      }
    }

    final canDrag = block.draggable;
    Widget child = TimeBlock(data: block, compact: widget.compactBlocks);

    if (canDrag && block.onMove != null) {
      child = GestureDetector(
        behavior: HitTestBehavior.opaque,
        onVerticalDragStart: (_) => setState(() {
          _dragId = block.id;
          _resizing = false;
          _dragDy = 0;
        }),
        onVerticalDragUpdate: (d) {
          if (_dragId != block.id) return;
          setState(() => _dragDy += d.delta.dy);
        },
        onVerticalDragEnd: (_) {
          if (_dragId != block.id) return;
          final newStart = snapToSlot((block.startMinutes + _deltaMinutes(_dragDy))
              .clamp(0, 24 * 60 - (block.endMinutes - block.startMinutes)));
          block.onMove!(newStart);
          setState(() {
            _dragId = null;
            _dragDy = 0;
          });
        },
        child: child,
      );
    }

    return Positioned(
      top: top,
      height: height,
      left: 1.5,
      right: 1.5,
      child: Stack(
        children: [
          Positioned.fill(child: child),
          if (canDrag && block.onResize != null)
            Positioned(
              left: 0,
              right: 0,
              bottom: 0,
              height: 14,
              child: GestureDetector(
                behavior: HitTestBehavior.opaque,
                onVerticalDragStart: (_) => setState(() {
                  _dragId = block.id;
                  _resizing = true;
                  _dragDy = 0;
                }),
                onVerticalDragUpdate: (d) {
                  if (_dragId != block.id) return;
                  setState(() => _dragDy += d.delta.dy);
                },
                onVerticalDragEnd: (_) {
                  if (_dragId != block.id) return;
                  final newEnd = snapToSlot((block.endMinutes + _deltaMinutes(_dragDy))
                      .clamp(block.startMinutes + kSnapMinutes, 24 * 60));
                  block.onResize!(newEnd);
                  setState(() {
                    _dragId = null;
                    _resizing = false;
                    _dragDy = 0;
                  });
                },
                child: Center(
                  child: Container(
                    width: 24,
                    height: 3,
                    decoration: BoxDecoration(
                      color: block.fg.withValues(alpha: 0.5),
                      borderRadius: BorderRadius.circular(2),
                    ),
                  ),
                ),
              ),
            ),
        ],
      ),
    );
  }
}

class _GridLinesPainter extends CustomPainter {
  _GridLinesPainter({required this.lineColor, required this.halfColor});

  final Color lineColor;
  final Color halfColor;

  @override
  void paint(Canvas canvas, Size size) {
    final solid = Paint()
      ..color = lineColor
      ..strokeWidth = 1;
    final half = Paint()
      ..color = halfColor
      ..strokeWidth = 0.5;
    for (int h = 0; h < 24; h++) {
      final y = h * kHourHeight;
      canvas.drawLine(Offset(kGutterWidth, y), Offset(size.width, y), solid);
      final hy = y + kHourHeight / 2;
      canvas.drawLine(Offset(kGutterWidth, hy), Offset(size.width, hy), half);
    }
  }

  @override
  bool shouldRepaint(_GridLinesPainter oldDelegate) =>
      oldDelegate.lineColor != lineColor || oldDelegate.halfColor != halfColor;
}
