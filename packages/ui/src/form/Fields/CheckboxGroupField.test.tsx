// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { Form, Formik, type FormikProps } from 'formik'
import CheckboxGroupField from './CheckboxGroupField'

const baseProps = {
  labelPosition: 'top' as const,
  missing: false,
  missingFields: [],
  values: {},
  setFormDirty: vi.fn(),
  disabled: false,
  currentValue: '',
}

describe('CheckboxGroupField', () => {
  it('checks numeric options by their text and keeps the picked ones numbers', () => {
    let form: FormikProps<{ sizes: number[] }> | undefined
    render(
      <Formik initialValues={{ sizes: [2] }} onSubmit={vi.fn()}>
        {(props) => {
          form = props
          return (
            <Form>
              <CheckboxGroupField
                {...baseProps}
                field={{ type: 'checkbox-group', name: 'sizes', options: [1, 2, 4] }}
                label="Sizes"
              />
            </Form>
          )
        }}
      </Formik>,
    )
    expect(screen.getByRole('checkbox', { name: '2' })).toBeChecked()
    fireEvent.click(screen.getByRole('checkbox', { name: '4' }))
    expect(form?.values.sizes).toEqual([2, 4])
  })
})
