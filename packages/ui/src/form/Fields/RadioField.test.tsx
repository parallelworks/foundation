// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { Form, Formik, type FormikProps } from 'formik'
import RadioField from './RadioField'

const baseProps = {
  labelPosition: 'top' as const,
  missing: false,
  missingFields: [],
  values: {},
  setFormDirty: vi.fn(),
  disabled: false,
  currentValue: '',
}

describe('RadioField', () => {
  it('capitalizes an option without a label, and shows a label as written', () => {
    let form: FormikProps<{ precision: string }> | undefined
    render(
      <Formik initialValues={{ precision: 'fp16' }} onSubmit={vi.fn()}>
        {(props) => {
          form = props
          return (
            <Form>
              <RadioField
                {...baseProps}
                field={{
                  type: 'radio',
                  name: 'precision',
                  options: ['fp16', { label: 'Double', value: 'fp64' }],
                }}
                label="Precision"
              />
            </Form>
          )
        }}
      </Formik>,
    )
    expect(screen.getByRole('radio', { name: 'fp16' })).toBeChecked()
    expect(screen.getByText('fp16')).toHaveClass('capitalize')
    expect(screen.getByText('Double')).not.toHaveClass('capitalize')
    fireEvent.click(screen.getByRole('radio', { name: 'Double' }))
    expect(form?.values.precision).toBe('fp64')
  })

  it('checks numeric options by their text and picks them as numbers', () => {
    let form: FormikProps<{ workers: number | string }> | undefined
    render(
      <Formik<{ workers: number | string }> initialValues={{ workers: 4 }} onSubmit={vi.fn()}>
        {(props) => {
          form = props
          return (
            <Form>
              <RadioField
                {...baseProps}
                field={{ type: 'radio', name: 'workers', options: [1, 2, 4] }}
                label="Workers"
              />
            </Form>
          )
        }}
      </Formik>,
    )
    expect(screen.getByRole('radio', { name: '4' })).toBeChecked()
    fireEvent.click(screen.getByRole('radio', { name: '2' }))
    expect(form?.values.workers).toBe(2)
    expect(screen.getByRole('radio', { name: '2' })).toBeChecked()
  })
})
