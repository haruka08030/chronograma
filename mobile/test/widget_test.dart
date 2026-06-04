import 'dart:io';

import 'package:chronograma_mobile/features/todo/data/todo_repository.dart';
import 'package:chronograma_mobile/features/todo/models/task.dart';
import 'package:chronograma_mobile/features/todo/models/task_priority.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:hive/hive.dart';

void main() {
  test('TodoRepository persists tasks', () async {
    final dir = await Directory.systemTemp.createTemp('chrono_repo_');
    Hive.init(dir.path);
    final box = await Hive.openBox<dynamic>('chronograma_repo_test');
    final repo = TodoRepository(box);

    expect(repo.hasEverPersisted, isFalse);

    final tasks = [
      Task(
        id: '1',
        title: 'A',
        priority: TaskPriority.high,
      ),
    ];
    repo.saveAll(tasks);
    expect(repo.hasEverPersisted, isTrue);
    expect(repo.readAll(), hasLength(1));
    expect(repo.readAll().first.title, 'A');

    final logTask = Task(
      id: 'log1',
      title: 'Focus',
      completed: true,
      dueDate: DateTime(2026, 4, 29),
      isTimeLog: true,
      startTime: '09:00',
      endTime: '10:30',
      description: 'memo',
    );
    repo.saveAll([logTask]);
    final round = repo.readAll().first;
    expect(round.isTimeLog, isTrue);
    expect(round.startTime, '09:00');
    expect(round.endTime, '10:30');
    expect(round.description, 'memo');

    await box.close();
    await Hive.deleteBoxFromDisk('chronograma_repo_test');
    await dir.delete(recursive: true);
  });
}
