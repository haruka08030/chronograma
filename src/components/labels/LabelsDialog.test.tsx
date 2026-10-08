import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { useTaskStore } from '../../store/taskStore'
import { LabelsDialog } from './LabelsDialog'

const seed = (targets: Record<string, number>) =>
  useTaskStore.setState({
    tasks: [],
    timeLogTagPresets: ['Study', 'ES'],
    logCategoryColors: { Study: 'sage', ES: 'tomato' },
    logLabelTargets: targets,
  })

const targetField = (name: string) => screen.getByRole('textbox', { name: `Weekly target for "${name}" (hours)` })

describe('LabelsDialog: 週の目安（#291）', () => {
  it('名前の右の欄に時間を書いて保存すると目安が付き、空にすると外れる', () => {
    seed({ ES: 300 })
    const onClose = vi.fn()
    render(<LabelsDialog onClose={onClose} />)
    expect(targetField('ES')).toHaveValue('5')
    fireEvent.change(targetField('Study'), { target: { value: '1.5' } })
    fireEvent.change(targetField('ES'), { target: { value: '' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(useTaskStore.getState().logLabelTargets).toEqual({ Study: 90 })
    expect(onClose).toHaveBeenCalled()
  })

  it('数として読めない文字は入らない', () => {
    seed({})
    render(<LabelsDialog onClose={() => {}} />)
    fireEvent.change(targetField('Study'), { target: { value: '1h' } })
    expect(targetField('Study')).toHaveValue('')
  })
})
