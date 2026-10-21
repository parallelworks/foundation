import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, within } from 'storybook/test'
import { useContextMenu } from '../components/ContextMenu'
import { StatusBadge } from '../components/StatusBadge'
import { Table } from '../components/Table'
import { Tooltip } from '../components/Tooltip'
import { CloudIcon, DiskIcon, InstanceIcon, NetworkInterfaceIcon } from '../icons'
import { GroupRow, ListColumns, ListPage, ListRow, useListNavigate } from './ListPage'
import { ListCellText, listTableFixedProps, NameCell } from './ListTable'
import { type ColumnDef, useListView } from './listView'

const meta: Meta = {
  title: 'UI/List/Group rows',
  parameters: { layout: 'fullscreen' },
}
export default meta

interface Resource {
  id: string
  name: string
  cspId: string
  type: 'Instance' | 'Disk' | 'Network interface'
  state: 'running' | 'stopped' | 'pending'
  account: string
  region: string
  zone: string
  started: string
  lastSeen: string
}

interface Cluster {
  key: string
  name: string
  owner: string
  orphaned?: boolean
  deleting?: boolean
  resources: Resource[]
}

const resource = (
  id: string,
  name: string,
  type: Resource['type'],
  state: Resource['state'],
  zone: string,
): Resource => ({
  id,
  name,
  cspId: `i-0${id}7c3e91a2f4`,
  type,
  state,
  account: 'research-prod',
  region: zone.slice(0, -1),
  zone,
  started: 'Oct 14, 09:12',
  lastSeen: '2 min ago',
})

const CLUSTERS: Cluster[] = [
  {
    key: 'gpu-training',
    name: 'gpu-training-a100-west-cluster',
    owner: 'mlopez',
    resources: [
      resource('1', 'gpu-training-controller', 'Instance', 'running', 'us-west-2a'),
      resource('2', 'gpu-training-worker-0', 'Instance', 'running', 'us-west-2a'),
      resource('3', 'gpu-training-worker-1', 'Instance', 'stopped', 'us-west-2b'),
    ],
  },
  {
    key: 'cfd-burst',
    name: 'cfd-burst',
    owner: 'akhan',
    orphaned: true,
    deleting: true,
    resources: [
      resource('4', 'cfd-burst-scratch', 'Disk', 'running', 'us-east-1c'),
      resource('5', 'cfd-burst-eni', 'Network interface', 'pending', 'us-east-1c'),
    ],
  },
]

const TYPE_ICON = {
  Instance: InstanceIcon,
  Disk: DiskIcon,
  'Network interface': NetworkInterfaceIcon,
} as const

const STATE_VARIANT = { running: 'success', stopped: 'muted', pending: 'warning' } as const

/** The columns of an inventory's Cluster tab: only the name has a priority of
 *  its own, so on a phone the rest stack under it. `priorities` gives some of
 *  them one instead, so they drop as the list narrows. */
function columns(priorities: boolean): ColumnDef[] {
  const low = priorities ? ({ priority: 'low' } as const) : {}
  const medium = priorities ? ({ priority: 'medium' } as const) : {}
  return [
    {
      key: 'name',
      label: 'Name',
      alwaysVisible: true,
      headerClassName: 'story-name-column truncate',
    },
    { key: 'type', label: 'Type', headerClassName: 'truncate' },
    { key: 'state', label: 'State', headerClassName: 'truncate' },
    { key: 'account', label: 'Cloud account', headerClassName: 'truncate', ...medium },
    { key: 'region', label: 'Region', headerClassName: 'truncate', ...low },
    { key: 'zone', label: 'Zone', headerClassName: 'truncate', ...low },
    { key: 'started', label: 'Started', headerClassName: 'truncate', ...low },
    { key: 'lastSeen', label: 'Last seen', headerClassName: 'truncate', ...medium },
  ]
}

function ClusterGroup({ cluster }: { cluster: Cluster }) {
  const running = cluster.resources.filter((r) => r.state === 'running').length
  return (
    <GroupRow
      label={
        <>
          <CloudIcon
            aria-hidden="true"
            className="size-4 shrink-0 text-(--theme-muted-text-color)"
          />
          <Tooltip content={cluster.key}>
            <span className="truncate text-[13px] font-semibold">{cluster.name}</span>
          </Tooltip>
          <span className="shrink-0 font-normal text-(--theme-muted-text-color)">
            · {cluster.owner}
          </span>
          {cluster.orphaned && <StatusBadge variant="warning">Orphan</StatusBadge>}
          {cluster.deleting && <StatusBadge variant="error">Deleting</StatusBadge>}
        </>
      }
      trailing={`${running}/${cluster.resources.length} running`}
    />
  )
}

function ClusterTab({ priorities }: { priorities: boolean }) {
  const goTo = useListNavigate()
  const { openMenu, contextMenu } = useContextMenu()
  const view = useListView<Resource>({
    storageKey: `workshop-group-rows${priorities ? ':priorities' : ''}`,
    columns: columns(priorities),
    defaultShowColumnHeaders: true,
  })
  const cell = (key: string, r: Resource) => {
    switch (key) {
      case 'type':
        return <ListCellText>{r.type}</ListCellText>
      case 'state':
        return <StatusBadge variant={STATE_VARIANT[r.state]}>{r.state}</StatusBadge>
      case 'account':
        return <ListCellText>{r.account}</ListCellText>
      case 'region':
        return <ListCellText mono>{r.region}</ListCellText>
      case 'zone':
        return <ListCellText mono>{r.zone}</ListCellText>
      case 'started':
        return <ListCellText>{r.started}</ListCellText>
      default:
        return <ListCellText>{r.lastSeen}</ListCellText>
    }
  }
  return (
    <ListPage view={view}>
      {/* The name column's share where the columns show, as the host's own stylesheet sets it. */}
      <style>{'@container (min-width: 36rem) { .story-name-column { width: 24%; } }'}</style>
      <Table {...listTableFixedProps}>
        <ListColumns view={view} />
        {CLUSTERS.flatMap((cluster) => [
          <ClusterGroup key={cluster.key} cluster={cluster} />,
          ...cluster.resources.map((r) => {
            const Icon = TYPE_ICON[r.type]
            return (
              <ListRow
                key={r.id}
                href={null}
                onActivate={() => {}}
                items={[{ label: 'Details', onClick: () => {} }]}
                goTo={goTo}
                openMenu={openMenu}
              >
                <NameCell
                  icon={<Icon className="size-4" />}
                  iconTile
                  name={r.name}
                  subtitle={r.cspId}
                  href={null}
                />
                {view.visibleColumns.slice(1).map((col) => (
                  <Table.Item key={col.key} className="py-2.5">
                    {cell(col.key, r)}
                  </Table.Item>
                ))}
              </ListRow>
            )
          }),
        ])}
      </Table>
      {contextMenu}
    </ListPage>
  )
}

/** An inventory's Cluster tab: each cluster's header row holds its provider's
 *  icon, its name with a tooltip, its owner, its badges and, against the far
 *  end, how many of its resources run. The header has a cell per column, so on
 *  a phone, where the columns stack under the name, the name column keeps the
 *  row's width instead of a hidden column's share. */
export const ClusterTabGroups: StoryObj = {
  render: () => <ClusterTab priorities={false} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(await canvas.findByText('2/3 running')).toBeVisible()
    await expect(canvas.getByText('Orphan')).toBeVisible()
    const nameHeader = canvas.getByRole('columnheader', { name: 'Name' })
    // The name column keeps at least a quarter of the list, whatever the group rows hold.
    await expect(nameHeader.getBoundingClientRect().width).toBeGreaterThan(
      canvasElement.getBoundingClientRect().width / 5,
    )
  },
}

/** The same tab with columns that drop as the list narrows: the group rows'
 *  cells drop with them, so the columns left share the width. */
export const GroupsWithPriorityColumns: StoryObj = {
  render: () => <ClusterTab priorities />,
}
