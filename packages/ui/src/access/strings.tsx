// English defaults for the access drawer; a host translates them through UIProvider's `access`.
// Counts and lists arrive as numbers and arrays, so a translation applies its own plural rules
// and list conjunction rather than patching English ones.

import { type ReactNode, useMemo } from 'react'
import { type UIStrings, useStrings } from '../components/Provider'

const plural = new Intl.PluralRules('en')
const list = new Intl.ListFormat('en', { type: 'conjunction' })

/** A count and its noun: "1 group", "1,024 groups". */
const countOf = (n: number, one: string, other: string) =>
  `${n.toLocaleString()} ${plural.select(n) === 'one' ? one : other}`
const and = (names: readonly string[]) => list.format(names)
// "research-team has", "research-team and contractors have".
const has = (names: readonly string[]) => (names.length === 1 ? 'has' : 'have')
/** Who, counted: "Everyone, 1 person and 3 groups". */
const who = (people: number, groups: number, everyone = false) =>
  [
    everyone && 'Everyone',
    people > 0 && countOf(people, 'person', 'people'),
    groups > 0 && countOf(groups, 'group', 'groups'),
  ].filter((part): part is string => typeof part === 'string')

export const ACCESS_STRINGS = {
  title: 'Access',
  /** Under the title: the resource, and how many people and groups have a role on it. */
  summary: (resource: string, people: number, groups: number, everyone: boolean) => {
    const parts = who(people, groups, everyone)
    const one = parts.length === 1 && (everyone || people + groups === 1)
    return parts.length === 0
      ? `${resource} · No one has access`
      : `${resource} · ${and(parts)} ${one ? 'has' : 'have'} access`
  },
  /** Names the switch between the two ways of listing who has access. */
  arrange: 'List access',
  byRole: 'By role',
  byPrincipal: 'By person or group',
  filter: 'Filter by role, person or group',
  grantAccess: 'Grant access',
  highImpact: 'High impact',
  loading: 'Loading who has access',
  /** How many hold a role: "1 person and 2 groups". */
  holders: (people: number, groups: number) => and(who(people, groups)),
  /** How many of a role's holders a filter left. */
  holdersShown: (shown: number, total: number) =>
    `${shown.toLocaleString()} of ${total.toLocaleString()}`,
  members: (n: number) => countOf(n, 'member', 'members'),
  people: (n: number) => countOf(n, 'person', 'people'),
  /** Everyone, where it is short: a tag or a picker row. */
  everyone: 'Everyone',
  /** Everyone, where it stands as a row of its own. */
  everyoneInOrganization: 'Everyone in your organization',
  everyoneJoinLater: 'Including people who join later',
  owner: 'Owner',
  /** Under the owner section and row. */
  ownerDescription: 'Has every permission, always. Can’t be removed.',
  /** Read with the badges a row folds away: "+2". */
  moreRoles: (n: number) => `+${n.toLocaleString()}`,
  moreRolesLabel: (roles: readonly string[]) => `Also ${and(roles)}`,
  /** Beside someone whose other role gives everything this one does. */
  coveredBy: (roles: readonly string[]) => `${and(roles)} covers this too`,
  /** Beside the owner, who has every role's permissions anyway. */
  ownerHasAll: 'Owns it, so has this anyway',
  /** Beside someone who has this through everyone as well. */
  everyoneHasThisToo: 'Everyone has this too',
  /** Beside someone who has this through their groups, or a grant above the resource, too. */
  throughToo: (from: readonly string[]) => `Has this through ${and(from)} too`,
  /** A role someone holds that another of their roles already gives. */
  redundant: (roles: readonly string[]) => `Redundant: ${and(roles)} already covers this.`,
  redundantOwner: 'Redundant: as the owner, they have every permission.',
  /** A role someone has only because everyone does. */
  throughEveryone: 'Everyone in your organization has it',
  /** A role someone has through one of their groups, or a grant above the resource. */
  through: (from: string) => `Through ${from}`,
  /** A role granted above the resource, which can't be taken away here. */
  inheritedFrom: (from: string) => `Through ${from}. Change it there.`,
  removeRole: (principal: string, role: string) => `Remove ${principal} from ${role}`,
  grantMoreRoles: 'Grant more roles',
  removeAllAccess: 'Remove all access',
  removeTitle: (principal: string, roles: readonly string[]) =>
    `Remove ${principal} from ${and(roles)}?`,
  removeAllTitle: (principal: string) => `Remove all of ${principal}’s access?`,
  /** Leads the list of what is lost; `members` is undefined when a group's size isn't known. */
  losesIntro: (kind: 'user' | 'group' | 'everyone', members: number | undefined) =>
    kind === 'everyone'
      ? 'People who have it only through everyone will no longer be able to:'
      : kind === 'user'
        ? 'They will no longer be able to:'
        : members === undefined
          ? 'Its members will no longer be able to:'
          : `Its ${countOf(members, 'member', 'members')} will no longer be able to:`,
  /** After the list: why these are lost, and what they keep. `through` is what they keep through
   *  their groups or grants above the resource, by where it comes from. */
  keeps: (
    own: readonly string[],
    throughEveryone: readonly string[],
    through: readonly { from: string; roles: readonly string[] }[],
  ) =>
    [
      'No other role of theirs gives these.',
      own.length > 0 && `They keep ${and(own)}.`,
      ...through.map(({ from, roles }) => `They keep ${and(roles)} through ${from}.`),
      throughEveryone.length > 0 && `They keep ${and(throughEveryone)}, which everyone has.`,
    ]
      .filter(Boolean)
      .join(' '),
  /** When the roles they keep give everything the removed ones did. */
  losesNothing: (roles: readonly string[]) =>
    `They lose nothing: ${and(roles)} still ${roles.length === 1 ? 'gives' : 'give'} them all of it.`,
  ownerLosesNothing: 'They lose nothing: as the owner, they have every permission.',
  confirmRemove: (roles: readonly string[]) =>
    roles.length === 1 ? `Remove ${roles[0]}` : 'Remove all access',
  removeFailed: (principal: string, roles: readonly string[]) =>
    `Couldn’t remove ${principal} from ${and(roles)}`,
  grantFailed: (principals: readonly string[], roles: readonly string[]) =>
    `Couldn’t grant ${and(roles)} to ${and(principals)}`,
  undoFailed: 'Couldn’t undo the change',
  /** Under a failed save; `reason` is the host's error message, when it gave one. */
  nothingChanged: (reason: string | undefined) =>
    reason ? `${reason.replace(/\.?$/, '.')} Nothing changed.` : 'Nothing changed.',
  /** The toast after a grant. */
  granted: (principals: readonly string[], roles: readonly string[]) =>
    `Gave ${and(principals)} ${and(roles)}.`,
  /** The toast after a removal. */
  removed: (principals: readonly string[], roles: readonly string[]) =>
    `Removed ${and(principals)} from ${and(roles)}.`,
  undone: 'Change undone.',
  readOnly: 'You can see who has access.',
  /** After `readOnly` when the host gives no reason. */
  readOnlyReason: 'Only people who manage access here can change it.',
  emptyTitle: 'No one has access yet',
  emptyDescription: (resource: string) =>
    `Give a person or group a role so they can see, use or manage ${resource}.`,
  noMatches: 'No roles, people or groups match',
  clearFilter: 'Clear filter',

  // The grant view.
  back: 'Back to who has access',
  principalsLabel: 'People and groups',
  addPrincipal: 'Add a person or group',
  /** Under the people and groups field; a count is undefined when the host doesn't give it. */
  pickerHint: (people: number | undefined, groups: number | undefined, everyone: boolean) =>
    `Search ${and([
      people === undefined ? 'people' : countOf(people, 'person', 'people'),
      groups === undefined ? 'groups' : countOf(groups, 'group', 'groups'),
    ])}${everyone ? ', or pick Everyone in your organization' : ''}.`,
  everyoneCoversGroups: 'Everyone covers every person and group, so there’s no need to add others.',
  organization: 'Organization',
  recent: 'Recent',
  peopleSection: 'People',
  groupsSection: 'Groups',
  /** On a row in the picker: the roles it holds here. */
  hasRoles: (roles: readonly string[]) => `has ${and(roles)}`,
  /** Read with a group's row: its size, where it comes from and its roles here. */
  groupSummary: (
    members: number | undefined,
    everyone: boolean,
    source: 'synced' | 'manual' | undefined,
    roles: readonly string[],
  ) =>
    [
      members !== undefined &&
        (everyone ? countOf(members, 'person', 'people') : countOf(members, 'member', 'members')),
      source === 'synced' && 'synced',
      roles.length > 0 ? `has ${and(roles)} here` : 'no roles here',
    ]
      .filter(Boolean)
      .join(', '),
  /** Read with a person's row: what tells them apart, and their roles here. */
  personSummary: (detail: string | undefined, owner: boolean, roles: readonly string[]) =>
    [detail, owner ? 'owner' : roles.length > 0 ? `has ${and(roles)} here` : 'no roles here']
      .filter(Boolean)
      .join(', '),
  rolesLabel: 'Roles',
  searchRoles: 'Search roles',
  /** On a role's row in the picker. */
  alreadyHave: (principals: readonly string[]) =>
    `${and(principals)} already ${has(principals)} it.`,
  alreadyCovered: (roles: readonly string[]) => `${and(roles)} already covers this.`,
  everyoneHasIt: 'Everyone already has it.',
  /** The footer's account of what pressing Grant does. */
  grantSummary: (principals: readonly string[], roles: readonly string[]): ReactNode => (
    <>
      <strong className="font-medium text-(--theme-app)">{and(principals)}</strong>{' '}
      {principals.length === 1 ? 'gets' : 'get'} {and(roles)}.
    </>
  ),
  /** Why Grant can't be pressed: everyone picked has every role picked already. */
  nothingToGrant: (principals: readonly string[], roles: readonly string[]) =>
    `${and(principals)} already ${has(principals)} ${and(roles)}, so there’s nothing to grant.`,
  pickPrincipalsAndRoles: 'Pick who to grant to, and the roles to grant.',
  pickPrincipals: 'Pick a person or group to grant to.',
  pickRoles: 'Pick a role to grant.',
  grant: (roles: readonly string[]) =>
    roles.length === 0
      ? 'Grant'
      : roles.length === 1
        ? `Grant ${roles[0]}`
        : `Grant ${countOf(roles.length, 'role', 'roles')}`,
  grantToEveryone: 'Grant to everyone',
  everyoneWarningTitle: (roles: readonly string[], people: number | undefined) =>
    people === undefined
      ? `${and(roles)} for everyone`
      : `${and(roles)} for all ${countOf(people, 'person', 'people')}`,
  everyoneWarning: (resource: string) =>
    `Everyone in your organization, and everyone who joins later, will have it on ${resource}.`,
  confirmEveryoneTitle: (roles: readonly string[], people: number | undefined) =>
    people === undefined
      ? `Grant ${and(roles)} to everyone?`
      : `Grant ${and(roles)} to all ${countOf(people, 'person', 'people')}?`,

  // The picker's details pane.
  synced: 'Synced from your identity provider',
  syncedShort: 'Synced',
  manual: 'Members added by hand',
  wholeOrganization: 'Your whole organization',
  joinLater: 'And anyone who joins later gets it automatically.',
  /** Heads the groups a person is in that hold a role here. */
  inGroups: 'In groups with access here',
  /** The first few members by name, and how many more there are. */
  memberNames: (names: readonly string[], more: number) =>
    more > 0 ? and([...names, `${more.toLocaleString()} more`]) : and(names),
  moreMembers: (n: number) => `+${n.toLocaleString()}`,
  onResource: (resource: string) => `On ${resource}`,
  noRolesHere: 'No roles here yet.',
  /** When a role being granted gives everything one already held does. */
  becomesRedundant: (granting: readonly string[], held: readonly string[]) =>
    `${and(granting)} also ${granting.length === 1 ? 'gives' : 'give'} them ${and(held)}, so ${and(held)} becomes redundant. Nothing is removed.`,
  alreadyHas: (roles: readonly string[]) => `Already has ${and(roles)}.`,
  everyoneReach: (roles: readonly string[], people: number | undefined) =>
    `${and(roles)} for everyone reaches ${people === undefined ? 'every person' : `all ${countOf(people, 'person', 'people')}`} in your organization, and anyone who joins later. You’ll be asked to confirm.`,
  updated: (ago: string) => `Membership updated ${ago}`,
  detailsFailed: 'Couldn’t load this group’s details.',
  loadingDetails: 'Loading the group’s details',
  noHighlight: 'Highlight a person or group to see more.',
}

/** The drawer's own text, which a host translates through UIProvider's `access`. */
export type AccessText = typeof ACCESS_STRINGS

/** The drawer's text with the shared words, such as Cancel and Retry, beside it. */
export type AccessStrings = AccessText & { common: UIStrings['common'] }

/** The access drawer's strings: the host's translations over the English defaults. */
export function useAccessStrings(): AccessStrings {
  const { access: overrides, common } = useStrings()
  return useMemo(() => ({ ...ACCESS_STRINGS, ...overrides, common }), [overrides, common])
}
