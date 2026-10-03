import { useState, useEffect, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { useTaskStore } from '../store/taskStore'
import type { SmartView } from '../store/storeTypes'
import { SECTION_HEADING_TEXT } from '../components/ListSectionHeading'
import { ActionMenu } from '../components/ui/ActionMenu'
import { CloseIcon, PencilIcon, PlusIcon, TrashIcon } from '../components/icons'
import { tip } from '../lib/tooltip'
import { SectionNameInput } from '../components/todo/sectionParts'

/**
 * To-Do 一覧のセクションの名前の変更・新規の名前入力・右クリックメニュー。
 * `sectionTitle` / `sectionActions` は見出しに、`draftSection` と `sectionMenuElement` は一覧に描画しておくこと。
 */
export function useSectionEditing(selectedListId: string | null, selectedView: SmartView | null) {
  const { t } = useTranslation()
  const addSectionStore = useTaskStore((s) => s.addSection)
  const renameSectionStore = useTaskStore((s) => s.renameSection)
  const deleteSectionStore = useTaskStore((s) => s.deleteSection)
  const setQuickAddSectionId = useTaskStore((s) => s.setQuickAddSectionId)
  const [editingSectionId, setEditingSectionId] = useState<string | null>(null)
  const [editingSectionName, setEditingSectionName] = useState('')
  /** 「＋ セクション」で開いた名前入力。名前が決まるまでセクションは作らない */
  const [draftSectionListId, setDraftSectionListId] = useState<string | null>(null)
  const [draftSectionName, setDraftSectionName] = useState('')
  /** セクションの見出しの右クリックメニュー */
  const [sectionMenu, setSectionMenu] = useState<{ x: number; y: number; sectionId: string; title: string; canQuickTarget: boolean } | null>(null)

  useEffect(() => {
    queueMicrotask(() => {
      setEditingSectionId(null)
      setEditingSectionName('')
      setDraftSectionListId(null)
      setDraftSectionName('')
    })
  }, [selectedListId, selectedView])

  const beginSectionRename = useCallback((sectionId: string, currentName: string) => {
    setEditingSectionId(sectionId)
    setEditingSectionName(currentName)
  }, [])

  const finishSectionRename = useCallback((sectionId: string, currentName: string) => {
    if (editingSectionId !== sectionId) return
    const name = editingSectionName.trim()
    if (name && name !== currentName) renameSectionStore(sectionId, name)
    setEditingSectionId(null)
    setEditingSectionName('')
  }, [editingSectionId, editingSectionName, renameSectionStore])

  const cancelSectionRename = useCallback((sectionId: string) => {
    if (editingSectionId !== sectionId) return
    setEditingSectionId(null)
    setEditingSectionName('')
  }, [editingSectionId])

  const finishDraftSection = useCallback(() => {
    const name = draftSectionName.trim()
    if (draftSectionListId && name) addSectionStore(draftSectionListId, name)
    setDraftSectionListId(null)
    setDraftSectionName('')
  }, [draftSectionListId, draftSectionName, addSectionStore])

  const cancelDraftSection = useCallback(() => {
    setDraftSectionListId(null)
    setDraftSectionName('')
  }, [])

  /** 「＋ セクション」: 名前の入力を開く */
  const beginDraftSection = useCallback((listId: string) => {
    setDraftSectionListId(listId)
    setDraftSectionName('')
  }, [])

  /** セクション名。押すとそこへ追加、ダブルクリックか鉛筆で名前を変える。手動でも並べ替え中でも同じ */
  const sectionTitle = (sectionId: string, title: string, canQuickTarget: boolean) =>
    editingSectionId === sectionId ? (
      <SectionNameInput
        value={editingSectionName}
        onChange={setEditingSectionName}
        onCommit={() => finishSectionRename(sectionId, title)}
        onCancel={() => cancelSectionRename(sectionId)}
      />
    ) : (
      <button
        type="button"
        className={`w-full text-left ${SECTION_HEADING_TEXT} truncate`}
        onClick={() => {
          if (canQuickTarget) setQuickAddSectionId(sectionId)
        }}
        // 名前の変更: PC はダブルクリックか、ホバーで出る鉛筆。スマホは鉛筆（リストと同じ）
        onDoubleClick={() => beginSectionRename(sectionId, title)}
        onContextMenu={(e) => {
          e.preventDefault()
          setSectionMenu({ x: e.clientX, y: e.clientY, sectionId, title, canQuickTarget })
        }}
      >
        {title}
      </button>
    )

  /** セクションの鉛筆（名前の変更）と × （削除）。PC はホバーで出す */
  const sectionActions = (sectionId: string, title: string) => (
    <span
      className="flex items-center gap-0.5 shrink-0 md:opacity-0 md:focus-within:opacity-100 md:group-hover:opacity-100"
      onClick={(e) => e.stopPropagation()}
    >
      <button
        type="button"
        className="p-1 rounded text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300"
        {...tip(t('sections.renameTitle'))}
        onClick={() => beginSectionRename(sectionId, title)}
      >
        <PencilIcon className="w-3.5 h-3.5" />
      </button>
      <button
        type="button"
        className="p-1 rounded text-zinc-400 hover:text-red-500"
        {...tip(t('common.delete'))}
        onClick={() => deleteSectionStore(sectionId)}
      >
        <CloseIcon className="w-3.5 h-3.5" />
      </button>
    </span>
  )

  const draftSection = draftSectionListId && draftSectionListId === selectedListId && (
    <div className="relative pt-3">
      <div className="flex items-center px-3 py-1.5 rounded-lg mb-0.5 bg-white dark:bg-zinc-900">
        <SectionNameInput
          value={draftSectionName}
          onChange={setDraftSectionName}
          onCommit={finishDraftSection}
          onCancel={cancelDraftSection}
        />
      </div>
    </div>
  )

  const sectionMenuElement = sectionMenu && (
    <ActionMenu
      x={sectionMenu.x}
      y={sectionMenu.y}
      header={sectionMenu.title}
      searchable={false}
      onClose={() => setSectionMenu(null)}
      entries={[
        {
          kind: 'leaf',
          id: 'rename',
          label: t('sections.renameTitle'),
          icon: <PencilIcon className="h-4 w-4" />,
          run: () => beginSectionRename(sectionMenu.sectionId, sectionMenu.title),
        },
        ...(sectionMenu.canQuickTarget
          ? [{
              kind: 'leaf' as const,
              id: 'add',
              label: t('sections.addHere'),
              icon: <PlusIcon className="h-4 w-4" />,
              run: () => setQuickAddSectionId(sectionMenu.sectionId),
            }]
          : []),
        {
          kind: 'leaf',
          id: 'delete',
          divider: true,
          label: t('sections.delete'),
          icon: <TrashIcon className="h-4 w-4" />,
          danger: true,
          run: () => deleteSectionStore(sectionMenu.sectionId),
        },
      ]}
    />
  )

  return { sectionTitle, sectionActions, beginDraftSection, draftSection, sectionMenuElement }
}
