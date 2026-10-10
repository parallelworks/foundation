import { DateTime } from 'luxon'
import { groupConversationsByDate } from './conversationActions'

const daysAgo = (days: number) => ({
  id: String(days),
  createdAt: DateTime.now().minus({ days }).toISO() ?? '',
})

describe('groupConversationsByDate', () => {
  it('groups by age newest first and leaves out empty groups', () => {
    const groups = groupConversationsByDate([daysAgo(0), daysAgo(40), daysAgo(1.5), daysAgo(3)])
    expect(groups.map((g) => [g.key, g.items.map((c) => c.id)])).toEqual([
      ['groupToday', ['0']],
      ['groupYesterday', ['1.5']],
      ['groupThisWeek', ['3']],
      ['groupOlder', ['40']],
    ])
  })
})
