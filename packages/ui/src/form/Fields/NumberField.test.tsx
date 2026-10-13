// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { fireEvent, screen, waitFor } from '@testing-library/react'
import { renderInForm } from '../../test/form'
import type { INumberField } from './NumberField'
import NumberField from './NumberField'

describe('NumberField', () => {
  const renderField = (field: Partial<INumberField> = {}, values: Record<string, unknown> = {}) =>
    renderInForm(
      <NumberField
        field={{ type: 'number', name: 'gpuCount', default: 1, ...field }}
        label="GPU Count"
        labelPosition="top"
        missing={false}
        disabled={false}
      />,
      values,
    )

  describe('prefillDefault', () => {
    it('seeds the default into the form value when prefillDefault is set and the value is unset', async () => {
      const { form } = renderField({ prefillDefault: true, default: 1 })
      await waitFor(() => expect(form.getValues('gpuCount')).toBe(1))
    })

    it('does not seed when prefillDefault is absent (default is placeholder-only)', () => {
      const { form } = renderField({ default: 1 })
      expect(form.getValues('gpuCount')).toBeUndefined()
    })

    it('does not overwrite an existing value', () => {
      const { form } = renderField({ prefillDefault: true, default: 1 }, { gpuCount: 4 })
      expect(form.getValues('gpuCount')).toBe(4)
    })
  })

  it('writes typed numbers and clamps them into range on blur', () => {
    const { form } = renderField({ min: 0, max: 8 })
    const input = screen.getByRole('spinbutton')
    fireEvent.focus(input)
    fireEvent.change(input, { target: { value: '12' } })
    expect(form.getValues('gpuCount')).toBe(12)
    fireEvent.blur(input)
    expect(form.getValues('gpuCount')).toBe(8)
    expect(input).toHaveValue(8)
  })

  it('shows a value the form sets while the field is not focused', () => {
    const { form } = renderField({}, { gpuCount: 2 })
    expect(screen.getByRole('spinbutton')).toHaveValue(2)
    fireEvent.change(screen.getByRole('spinbutton'), { target: { value: '3' } })
    expect(form.getValues('gpuCount')).toBe(3)
  })
})
