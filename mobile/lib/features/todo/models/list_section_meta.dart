/// Supabase `list_sections` 行のローカル表現（Web `ListSection` に相当）。
class ListSectionMeta {
  const ListSectionMeta({
    required this.id,
    required this.listId,
    required this.name,
    required this.sortOrder,
  });

  final String id;
  final String listId;
  final String name;
  final int sortOrder;

  ListSectionMeta copyWith({
    String? id,
    String? listId,
    String? name,
    int? sortOrder,
  }) {
    return ListSectionMeta(
      id: id ?? this.id,
      listId: listId ?? this.listId,
      name: name ?? this.name,
      sortOrder: sortOrder ?? this.sortOrder,
    );
  }

  Map<String, dynamic> toJson() => {
        'id': id,
        'listId': listId,
        'name': name,
        'sortOrder': sortOrder,
      };

  factory ListSectionMeta.fromJson(Map<String, dynamic> json) {
    return ListSectionMeta(
      id: json['id'] as String,
      listId: (json['listId'] ?? json['list_id']) as String? ?? '',
      name: json['name'] as String? ?? '',
      sortOrder: switch (json['sortOrder'] ?? json['sort_order']) {
        final int i => i,
        final String s => int.tryParse(s) ?? 0,
        final v => int.tryParse('$v') ?? 0,
      },
    );
  }
}
