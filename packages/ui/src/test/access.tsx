// Sample groups and permissions for the access drawer's stories and tests.
import type {
  AccessGroup,
  AccessPermission,
  AccessValue,
  ImpliedPermissions,
} from '../components/access/accessValue'

const AREAS = [
  'analytics',
  'bio',
  'climate',
  'data',
  'design',
  'energy',
  'finance',
  'genomics',
  'imaging',
  'materials',
  'ml',
  'ops',
  'platform',
  'quantum',
  'research',
  'security',
  'simulation',
  'support',
  'viz',
  'weather',
]
const TEAMS = [
  'admins',
  'dev',
  'interns',
  'lab',
  'leads',
  'oncall',
  'prod',
  'readers',
  'staff',
  'students',
  'reviewers',
  'users',
]

export function makeGroups(count: number): AccessGroup[] {
  const groups: AccessGroup[] = []
  for (let i = 0; groups.length < count; i++) {
    const area = AREAS[i % AREAS.length]
    const team = TEAMS[Math.floor(i / AREAS.length) % TEAMS.length]
    const round = Math.floor(i / (AREAS.length * TEAMS.length))
    groups.push({
      name: `${area}-${team}${round ? `-${round + 1}` : ''}`,
      members: ((i * 37) % 140) + 1,
    })
  }
  return groups
}

const CATALOG: [string, string, [string, string[]][]][] = [
  [
    'Compute',
    'compute',
    [
      ['clusters', ['view', 'create', 'start', 'stop', 'delete', 'login', 'sudo', 'resize']],
      ['nodes', ['view', 'drain', 'reboot']],
      ['images', ['use', 'publish']],
      ['quotas', ['view', 'edit']],
    ],
  ],
  [
    'Storage',
    'storage',
    [
      ['buckets', ['view', 'create', 'delete', 'mount', 'read', 'write']],
      ['disks', ['view', 'attach', 'snapshot']],
      ['snapshots', ['view', 'restore', 'delete']],
      ['filesystems', ['view', 'mount', 'share']],
    ],
  ],
  [
    'Workflows',
    'workflows',
    [
      ['workflows', ['view', 'run', 'edit', 'publish', 'delete']],
      ['runs', ['view', 'cancel', 'retry', 'logs']],
      ['schedules', ['view', 'edit']],
      ['secrets', ['use']],
    ],
  ],
  [
    'Sessions',
    'sessions',
    [
      ['sessions', ['view', 'start', 'stop', 'share', 'connect']],
      ['desktops', ['view', 'start']],
      ['notebooks', ['view', 'start', 'stop']],
      ['tunnels', ['view', 'create', 'delete']],
    ],
  ],
  [
    'Kubernetes',
    'k8s',
    [
      ['namespaces', ['view', 'create', 'delete']],
      ['workloads', ['view', 'deploy', 'scale', 'delete']],
      ['pods', ['logs', 'exec']],
      ['rolebindings', ['view', 'edit']],
    ],
  ],
  [
    'AI models',
    'ai',
    [
      ['models', ['view', 'use', 'configure']],
      ['providers', ['view', 'connect', 'disconnect']],
      ['budgets', ['view', 'edit']],
      ['keys', ['create', 'revoke']],
      ['usage', ['view', 'export']],
    ],
  ],
  [
    'Networking',
    'network',
    [
      ['networks', ['view', 'create', 'delete']],
      ['firewalls', ['view', 'edit']],
      ['ips', ['allocate', 'release']],
      ['dns', ['view', 'edit']],
    ],
  ],
  [
    'Billing',
    'billing',
    [
      ['costs', ['view', 'export']],
      ['invoices', ['view', 'download']],
      ['budgets', ['view', 'edit']],
      ['allocations', ['view', 'use', 'edit']],
    ],
  ],
  [
    'Identity',
    'iam',
    [
      ['users', ['view', 'invite', 'suspend']],
      ['groups', ['view', 'create', 'edit', 'delete']],
      ['keys', ['view', 'create', 'revoke']],
    ],
  ],
  [
    'Audit',
    'audit',
    [
      ['logs', ['view', 'export', 'stream']],
      ['events', ['view', 'subscribe']],
      ['retention', ['view', 'edit']],
    ],
  ],
]

const MANY: AccessPermission[] = CATALOG.flatMap(([category, prefix, resources]) =>
  resources.flatMap(([resource, actions]) =>
    actions.map((action) => ({
      key: `${prefix}.${resource}.${action}`,
      label: `${action[0]?.toUpperCase()}${action.slice(1)} ${resource}`,
      category,
    })),
  ),
)

const FEW: AccessPermission[] = [
  { key: 'admin', label: 'Admin', description: 'Full control, including who has access.' },
  { key: 'writer', label: 'Writer', description: 'Change the definition.' },
  { key: 'sudo', label: 'Sudo', description: 'Run commands as root.' },
  { key: 'login', label: 'Login', description: 'Sign in and submit work.' },
]
export const FEW_IMPLIED: ImpliedPermissions = {
  writer: ['admin'],
  sudo: ['admin'],
  login: ['admin', 'writer', 'sudo'],
}
const ONE: AccessPermission[] = [{ key: 'use', label: 'Use', description: 'Use this resource.' }]

export type Catalog = 'many' | 'few' | 'one'

const SAMPLE: Record<Catalog, Record<string, string[]>> = {
  many: {
    'analytics-admins': [
      'compute.clusters.view',
      'compute.clusters.start',
      'compute.clusters.stop',
      'compute.clusters.login',
      'compute.clusters.sudo',
      'storage.buckets.mount',
      'billing.costs.view',
    ],
    'bio-admins': ['compute.clusters.login', 'workflows.workflows.run', 'workflows.runs.logs'],
    'climate-admins': [
      'compute.clusters.login',
      'storage.buckets.read',
      'sessions.sessions.start',
      'ai.models.use',
    ],
    'data-admins': ['storage.buckets.view', 'storage.buckets.read'],
    'energy-admins': [
      'compute.clusters.start',
      'compute.quotas.view',
      'storage.disks.attach',
      'k8s.workloads.deploy',
      'ai.models.use',
      'audit.logs.view',
    ],
  },
  few: {
    'analytics-admins': ['admin'],
    'bio-admins': ['writer'],
    'climate-admins': ['sudo'],
    'data-admins': ['login'],
  },
  one: { 'analytics-admins': ['use'], 'bio-admins': ['use'], 'climate-admins': ['use'] },
}

export function makeValue(
  catalog: Catalog,
  empty: boolean,
  organizationGranted: boolean,
): AccessValue {
  if (empty) {
    return { organization: {}, groups: {} }
  }
  const groups = Object.fromEntries(
    Object.entries(SAMPLE[catalog]).map(([name, keys]) => [
      name,
      Object.fromEntries(keys.map((k) => [k, true])),
    ]),
  )
  const orgKey = catalog === 'many' ? 'compute.clusters.view' : catalog === 'few' ? 'login' : 'use'
  return { organization: organizationGranted ? { [orgKey]: true } : {}, groups }
}

export const PERMISSIONS: Record<Catalog, AccessPermission[]> = { many: MANY, few: FEW, one: ONE }

export const description = (
  <>
    Cluster <span className="font-mono text-(--theme-app)">gpu-west</span>
  </>
)
