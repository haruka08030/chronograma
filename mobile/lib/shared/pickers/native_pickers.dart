import 'dart:io';

import 'package:flutter/cupertino.dart';
import 'package:flutter/material.dart';

/// iOS では Cupertino ホイール、Android では Material ピッカー。
Future<DateTime?> pickNativeDate(
  BuildContext context, {
  required DateTime initialDate,
  required DateTime firstDate,
  required DateTime lastDate,
}) {
  if (Platform.isIOS) {
    return _pickCupertinoDate(
      context,
      initialDate: initialDate,
      firstDate: firstDate,
      lastDate: lastDate,
    );
  }
  return showDatePicker(
    context: context,
    initialDate: initialDate,
    firstDate: firstDate,
    lastDate: lastDate,
  );
}

Future<TimeOfDay?> pickNativeTime(
  BuildContext context, {
  required TimeOfDay initialTime,
}) {
  if (Platform.isIOS) {
    return _pickCupertinoTime(context, initialTime: initialTime);
  }
  return showTimePicker(context: context, initialTime: initialTime);
}

Future<DateTime?> _pickCupertinoDate(
  BuildContext context, {
  required DateTime initialDate,
  required DateTime firstDate,
  required DateTime lastDate,
}) {
  var picked = DateTime(
    initialDate.year,
    initialDate.month,
    initialDate.day,
  );
  if (picked.isBefore(firstDate)) picked = firstDate;
  if (picked.isAfter(lastDate)) picked = lastDate;

  return showCupertinoModalPopup<DateTime>(
    context: context,
    builder: (ctx) {
      final bottom = MediaQuery.paddingOf(ctx).bottom;
      return Container(
        height: 280 + bottom,
        color: CupertinoColors.systemBackground.resolveFrom(ctx),
        child: SafeArea(
          top: false,
          child: Column(
            children: [
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  CupertinoButton(
                    onPressed: () => Navigator.pop(ctx),
                    child: const Text('キャンセル'),
                  ),
                  CupertinoButton(
                    onPressed: () => Navigator.pop(ctx, picked),
                    child: const Text('完了'),
                  ),
                ],
              ),
              Expanded(
                child: CupertinoDatePicker(
                  mode: CupertinoDatePickerMode.date,
                  initialDateTime: picked,
                  minimumDate: firstDate,
                  maximumDate: lastDate,
                  onDateTimeChanged: (d) => picked = d,
                ),
              ),
            ],
          ),
        ),
      );
    },
  );
}

Future<TimeOfDay?> _pickCupertinoTime(
  BuildContext context, {
  required TimeOfDay initialTime,
}) {
  var picked = initialTime;

  return showCupertinoModalPopup<TimeOfDay>(
    context: context,
    builder: (ctx) {
      final bottom = MediaQuery.paddingOf(ctx).bottom;
      return Container(
        height: 280 + bottom,
        color: CupertinoColors.systemBackground.resolveFrom(ctx),
        child: SafeArea(
          top: false,
          child: Column(
            children: [
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  CupertinoButton(
                    onPressed: () => Navigator.pop(ctx),
                    child: const Text('キャンセル'),
                  ),
                  CupertinoButton(
                    onPressed: () => Navigator.pop(ctx, picked),
                    child: const Text('完了'),
                  ),
                ],
              ),
              Expanded(
                child: CupertinoDatePicker(
                  mode: CupertinoDatePickerMode.time,
                  use24hFormat: true,
                  initialDateTime: DateTime(2000, 1, 1, picked.hour, picked.minute),
                  onDateTimeChanged: (d) {
                    picked = TimeOfDay(hour: d.hour, minute: d.minute);
                  },
                ),
              ),
            ],
          ),
        ),
      );
    },
  );
}
