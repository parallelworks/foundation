import { findChoice, toFieldItems } from './fieldItems'

describe('toFieldItems', () => {
  it('keeps what a choice sets and whether it can be picked', () => {
    expect(
      toFieldItems([
        'plain',
        { label: 'East', value: 'east', secondaryValue: 'east-1', disabled: true },
        { label: 'Old', value: 'old', secondaryLabel: 'the older key' },
      ]),
    ).toEqual([
      'plain',
      { label: 'East', value: 'east', secondaryValue: 'east-1', disabled: true },
      { label: 'Old', value: 'old', description: 'the older key' },
    ])
  })

  it('keeps headed groups, and gathers choices between them into untitled ones in place', () => {
    expect(
      toFieldItems([
        'first',
        { category: 'Zones', options: [{ label: 'A', value: 'a' }] },
        'second',
        'third',
      ]),
    ).toEqual([
      { label: '', items: ['first'] },
      { label: 'Zones', items: [{ label: 'A', value: 'a' }] },
      { label: '', items: ['second', 'third'] },
    ])
  })
})

describe('findChoice', () => {
  it('finds a choice inside a group by its value’s content', () => {
    const items = toFieldItems<unknown>([
      {
        category: 'Shared',
        options: [{ label: 'Bucket', value: { id: 'b' }, secondaryValue: 's3' }],
      },
    ])
    expect(findChoice(items, { id: 'b' })?.secondaryValue).toBe('s3')
  })
})
