// The one import point for interface icons: import them from here, never from
// 'lucide-react'. Logos of other companies' products are in './brandIcons'.
import type { LucideIcon, LucideProps } from 'lucide-react'
import {
  Activity,
  Archive,
  ArrowDownWideNarrow,
  ArrowLeftRight,
  ArrowUpDown,
  ArrowUpNarrowWide,
  AtSign,
  BadgeCheck,
  BanknoteX,
  Bell,
  BellOff,
  BellRing,
  BookOpenText,
  BookUser,
  Bot,
  Boxes,
  Braces,
  Brain,
  BrainCircuit,
  Briefcase,
  Building2,
  CalendarClock,
  CalendarSync,
  CalendarX,
  ChartLine,
  ChartPie,
  ChevronsDown,
  ChevronsDownUp,
  ChevronsUp,
  ChevronsUpDown,
  Circle,
  CircleCheck,
  CircleDollarSign,
  CircleDot,
  CircleHelp,
  CircleMinus,
  CircleSlash,
  CircleX,
  ClipboardCheck,
  ClipboardPen,
  Cloud,
  CloudCog,
  CloudOff,
  Code,
  CodeXml,
  Cog,
  Columns3,
  CornerUpRight,
  CreditCard,
  createLucideIcon,
  Database,
  DatabaseSearch,
  DatabaseZap,
  Disc3,
  Earth,
  Ellipsis,
  EthernetPort,
  EyeOff,
  File,
  FileArchive,
  FileCode,
  FileImage,
  FileKey,
  FilePenLine,
  Files,
  FileType,
  Fingerprint,
  Flag,
  FlaskConical,
  FolderKanban,
  FolderOpen,
  FolderPlus,
  Folders,
  FolderTree,
  Funnel,
  FunnelX,
  Gauge,
  GitCommitHorizontal,
  GitFork,
  GitPullRequest,
  Globe,
  GraduationCap,
  Grid3x3,
  GripHorizontal,
  Group,
  Handshake,
  HardDrive,
  HatGlasses,
  Headset,
  Heart,
  HeartOff,
  History,
  Hourglass,
  House,
  IdCard,
  Inbox,
  Keyboard,
  KeyRound,
  Landmark,
  Languages,
  Layers,
  LayoutGrid,
  LibraryBig,
  List,
  ListOrdered,
  ListTodo,
  ListVideo,
  Lock,
  LogIn,
  LogOut,
  Logs,
  Mail,
  MailCheck,
  MailX,
  MapPin,
  Maximize,
  Megaphone,
  MemoryStick,
  Menu,
  MessageSquare,
  MessageSquareWarning,
  Minimize,
  Minimize2,
  Minus,
  Monitor,
  MonitorDown,
  MonitorPlay,
  MonitorSmartphone,
  Moon,
  Music,
  Network,
  NotebookText,
  PaintBucket,
  PanelLeft,
  PanelLeftClose,
  PanelLeftOpen,
  Paperclip,
  PartyPopper,
  Pause,
  PencilLine,
  Phone,
  Pin,
  Printer,
  QrCode,
  Redo2,
  Rocket,
  RotateCcwSquare,
  Scale,
  ScanEye,
  ScrollText,
  Send,
  Settings2,
  Share2,
  Sheet,
  ShieldOff,
  ShieldUser,
  Smartphone,
  Sparkles,
  Square,
  SquareChevronRight,
  SquareCode,
  SquareDashed,
  SquarePen,
  SquareSplitHorizontal,
  SquareTerminal,
  Star,
  Store,
  Sun,
  Tag,
  TextCursorInput,
  Undo2,
  UndoDot,
  Unlink,
  Unplug,
  UserCheck,
  UserMinus,
  UserPlus,
  UserX,
  Video,
  Wallet,
  WandSparkles,
  Waypoints,
  Webhook,
  Wrench,
  X,
  Zap,
  ZoomIn,
  ZoomOut,
} from 'lucide-react'
import type { ReactNode } from 'react'

export interface IconProps extends LucideProps {
  /** Names the icon for assistive technology. Without it, or an `aria-label`,
   *  the icon is decoration and hidden from assistive technology. */
  title?: string | undefined
}

/** An icon from this module or the brand icons. */
export type IconType = (props: IconProps) => ReactNode

// Lucide draws on a 24px grid; this is the drawn glyphs' 1.5 on their 16px
// grid, so the two sets keep one weight while lucide's are being redrawn.
const STROKE_WIDTH = 2.25

/** The text's size and color by default, so a class such as `size-4` or a
 *  parent's font size sets it. */
function icon(Glyph: LucideIcon, defaults?: LucideProps): IconType {
  function Icon({ title, children, ...props }: IconProps) {
    const named = Boolean(title || props['aria-label'] || props['aria-labelledby'])
    return (
      <Glyph
        size="1em"
        strokeWidth={STROKE_WIDTH}
        {...defaults}
        {...(named ? { role: 'img' } : {})}
        {...props}
      >
        {title ? (
          <>
            <title>{title}</title>
            {children}
          </>
        ) : (
          children
        )}
      </Glyph>
    )
  }
  Icon.displayName = Glyph.displayName
  return Icon
}

// A filled glyph marks a state its outline doesn't have, such as pinned.
const filled: LucideProps = { fill: 'currentColor' }

// Drawn for this module on a 16px grid, with fewer and simpler shapes than
// lucide's so they stay crisp at the 16px they're mostly shown at. Lucide's
// glyphs are being redrawn this way one by one; until then the two sit
// together, so a drawn glyph takes `strokeWidth` in lucide's 24px units.
const LUCIDE_TO_DRAWN = 16 / 24

/** A glyph drawn as one path on the 16px grid. */
function drawn(d: string): IconType {
  function Icon({
    title,
    children,
    size = '1em',
    color = 'currentColor',
    strokeWidth,
    absoluteStrokeWidth: _absoluteStrokeWidth,
    ...props
  }: IconProps) {
    const named = Boolean(title || props['aria-label'] || props['aria-labelledby'])
    return (
      // biome-ignore lint/a11y/noSvgWithoutTitle: hidden from assistive technology unless a title or label names it
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 16 16"
        width={size}
        height={size}
        fill="none"
        stroke={color}
        strokeWidth={Number(strokeWidth ?? STROKE_WIDTH) * LUCIDE_TO_DRAWN}
        strokeLinecap="round"
        strokeLinejoin="round"
        {...(named ? { role: 'img' } : { 'aria-hidden': true })}
        {...props}
      >
        {title && <title>{title}</title>}
        <path d={d} />
        {children}
      </svg>
    )
  }
  return Icon
}

// Glyphs lucide doesn't draw, built from its own shapes on its 24px grid so
// they sit with the rest.

// Wallet's two strokes with a plus inside, where FolderPlus puts its own, so
// adding an allocation reads as AddProjectIcon and AddUserIcon do.
const WalletPlus = /* @__PURE__ */ createLucideIcon('wallet-plus', [
  [
    'path',
    {
      d: 'M19 7V4a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4h-3a2 2 0 0 0 0 4h3a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1',
      key: 'wallet-flap',
    },
  ],
  ['path', { d: 'M3 5v14a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-4', key: 'wallet-body' }],
  ['path', { d: 'M10 11v6', key: 'plus-stem' }],
  ['path', { d: 'M7 14h6', key: 'plus-bar' }],
])

export const AccessIcon = /* @__PURE__ */ drawn(
  'M6.5 7.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5ZM2 13.5c.5-2.2 2.3-3.5 4.5-3.5M10 11h4v3h-4ZM11 11V9.75a1 1 0 0 1 2 0V11',
)
export const AddAllocationIcon = /* @__PURE__ */ icon(WalletPlus)
export const AddIcon = /* @__PURE__ */ drawn('M8 3v10M3 8h10')
export const AddProjectIcon = /* @__PURE__ */ icon(FolderPlus)
export const AddUserIcon = /* @__PURE__ */ icon(UserPlus)
export const AgentIcon = /* @__PURE__ */ icon(Bot)
export const AllocationIcon = /* @__PURE__ */ icon(Wallet)
export const APIIcon = /* @__PURE__ */ icon(CodeXml)
export const ArchiveIcon = /* @__PURE__ */ icon(Archive)
export const ArrowDownIcon = /* @__PURE__ */ drawn('M8 2.75v10.5M3.75 9 8 13.25 12.25 9')
export const ArrowLeftIcon = /* @__PURE__ */ drawn('M13.25 8H2.75M7 3.75 2.75 8 7 12.25')
export const ArrowRightIcon = /* @__PURE__ */ drawn('M2.75 8h10.5M9 3.75 13.25 8 9 12.25')
export const ArrowUpIcon = /* @__PURE__ */ drawn('M8 13.25V2.75M3.75 7 8 2.75 12.25 7')
export const ArticleIcon = /* @__PURE__ */ icon(BookOpenText)
export const AttachmentIcon = /* @__PURE__ */ icon(Paperclip)
export const AuthenticationIcon = /* @__PURE__ */ icon(Fingerprint)
export const BillingIcon = /* @__PURE__ */ icon(CreditCard)
export const BriefcaseIcon = /* @__PURE__ */ icon(Briefcase)
export const BucketIcon = /* @__PURE__ */ icon(PaintBucket)
export const BuildWorkflowIcon = /* @__PURE__ */ icon(Wrench)
export const CalendarIcon = /* @__PURE__ */ drawn(
  'M2.5 3.5h11v10h-11ZM2.5 6.5h11M5.5 2v2.5M10.5 2v2.5',
)
export const CancelIcon = /* @__PURE__ */ drawn(
  'M8 14A6 6 0 1 0 8 2a6 6 0 0 0 0 12ZM3.75 3.75l8.5 8.5',
)
export const CelebrateIcon = /* @__PURE__ */ icon(PartyPopper)
export const CertificateIcon = /* @__PURE__ */ icon(FileKey)
export const ChangesRequestedIcon = /* @__PURE__ */ icon(MessageSquareWarning)
export const ChartIcon = /* @__PURE__ */ icon(ChartLine)
export const ChatIcon = /* @__PURE__ */ drawn(
  'M2.5 3.5a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v4a1 1 0 0 1-1 1H5.5l-3 2.25ZM10.5 5.5h2a1 1 0 0 1 1 1v6.75l-3-2.25h-4a1 1 0 0 1-1-1v-1.5',
)
export const CheckIcon = /* @__PURE__ */ drawn('M3.5 8.5 6.5 11.5 12.5 4.5')
export const ChevronDoubleDownIcon = /* @__PURE__ */ icon(ChevronsDown)
export const ChevronDoubleUpIcon = /* @__PURE__ */ icon(ChevronsUp)
export const ChevronDownIcon = /* @__PURE__ */ drawn('M3.5 6 8 10.5 12.5 6')
export const ChevronLeftIcon = /* @__PURE__ */ drawn('M10 3.5 5.5 8 10 12.5')
export const ChevronRightIcon = /* @__PURE__ */ drawn('M6 3.5 10.5 8 6 12.5')
export const ChevronUpIcon = /* @__PURE__ */ drawn('M3.5 10 8 5.5l4.5 4.5')
export const ClipboardCheckIcon = /* @__PURE__ */ icon(ClipboardCheck)
export const ClockIcon = /* @__PURE__ */ drawn(
  'M8 14A6 6 0 1 0 8 2a6 6 0 0 0 0 12ZM8 4.75V8l2.25 1.5',
)
export const CloseIcon = /* @__PURE__ */ drawn('M4 4l8 8M12 4l-8 8')
export const CloudIcon = /* @__PURE__ */ icon(Cloud)
export const ClusterIcon = /* @__PURE__ */ drawn(
  'M3.5 2.5h9a1 1 0 0 1 1 1V6a1 1 0 0 1-1 1h-9a1 1 0 0 1-1-1V3.5a1 1 0 0 1 1-1ZM3.5 9h9a1 1 0 0 1 1 1v2.5a1 1 0 0 1-1 1h-9a1 1 0 0 1-1-1V10a1 1 0 0 1 1-1ZM5 4.75h.01M5 11.25h.01',
)
export const CodeIcon = /* @__PURE__ */ icon(Code)
export const CollapseIcon = /* @__PURE__ */ icon(ChevronsDownUp)
export const ColumnsIcon = /* @__PURE__ */ icon(Columns3)
export const CommentIcon = /* @__PURE__ */ icon(MessageSquare)
export const CommitIcon = /* @__PURE__ */ icon(GitCommitHorizontal)
export const ComputeIcon = /* @__PURE__ */ icon(CloudCog)
export const ConnectIcon = /* @__PURE__ */ drawn(
  'M5.5 2v3M10.5 2v3M3.5 5h9v2.5a4.5 4.5 0 0 1-9 0ZM8 12v2',
)
export const ContractIcon = /* @__PURE__ */ icon(FilePenLine)
export const CopyIcon = /* @__PURE__ */ drawn(
  'M6.5 5.5h6a1 1 0 0 1 1 1v6a1 1 0 0 1-1 1h-6a1 1 0 0 1-1-1v-6a1 1 0 0 1 1-1ZM10.5 5.5v-2a1 1 0 0 0-1-1h-6a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h2',
)
export const CustomizeIcon = /* @__PURE__ */ icon(WandSparkles)
export const DesktopIcon = /* @__PURE__ */ icon(Monitor)
export const DestroyIcon = /* @__PURE__ */ icon(CloudOff)
export const DeviceIcon = /* @__PURE__ */ icon(MonitorSmartphone)
export const DirectoryIcon = /* @__PURE__ */ icon(BookUser)
export const DisableCostIcon = /* @__PURE__ */ icon(BanknoteX)
export const DisableUserIcon = /* @__PURE__ */ icon(UserX)
export const DisconnectIcon = /* @__PURE__ */ icon(Unplug)
export const DiskIcon = /* @__PURE__ */ icon(HardDrive)
export const DisplayIcon = /* @__PURE__ */ icon(Settings2)
export const DownloadIcon = /* @__PURE__ */ drawn(
  'M8 2.5v8M4.75 7.5 8 10.75l3.25-3.25M2.5 10.5v2a1 1 0 0 0 1 1h9a1 1 0 0 0 1-1v-2',
)
export const DragHandleIcon = /* @__PURE__ */ icon(GripHorizontal)
export const DuplicateIcon = /* @__PURE__ */ drawn(
  'M6.5 5.5h6a1 1 0 0 1 1 1v6a1 1 0 0 1-1 1h-6a1 1 0 0 1-1-1v-6a1 1 0 0 1 1-1ZM10.5 5.5v-2a1 1 0 0 0-1-1h-6a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h2M9.5 7.75v3.5M7.75 9.5h3.5',
)
export const EditIcon = /* @__PURE__ */ drawn(
  'M10.5 2.5a1.4 1.4 0 0 1 2 0l1 1a1.4 1.4 0 0 1 0 2L6 13l-3.5.75L3.25 10.25ZM9 4l3 3',
)
export const EditorIcon = /* @__PURE__ */ icon(SquareCode)
export const EducationIcon = /* @__PURE__ */ icon(GraduationCap)
export const EnableCostIcon = /* @__PURE__ */ icon(CircleDollarSign)
export const EnableUserIcon = /* @__PURE__ */ icon(UserCheck)
export const EndpointIcon = /* @__PURE__ */ icon(Earth)
export const ErrorIcon = /* @__PURE__ */ drawn(
  'M8 14A6 6 0 1 0 8 2a6 6 0 0 0 0 12ZM8 4.75v3.75M8 11h.01',
)
export const EventsIcon = /* @__PURE__ */ icon(Logs)
export const ExpandIcon = /* @__PURE__ */ icon(Maximize)
export const ExpandVerticalIcon = /* @__PURE__ */ icon(ChevronsUpDown)
export const ExpiredIcon = /* @__PURE__ */ icon(CalendarX)
export const ExpiringIcon = /* @__PURE__ */ icon(Hourglass)
export const ExpressionIcon = /* @__PURE__ */ icon(Braces)
export const ExternalLinkIcon = /* @__PURE__ */ drawn(
  'M9.5 2.5h4v4M13.5 2.5l-6 6M11.5 9.5v3a1 1 0 0 1-1 1h-7a1 1 0 0 1-1-1v-7a1 1 0 0 1 1-1h3',
)
export const EyeIcon = /* @__PURE__ */ drawn(
  'M1.75 8S4 3.5 8 3.5 14.25 8 14.25 8 12 12.5 8 12.5 1.75 8 1.75 8ZM8 10a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z',
)
export const EyeOffIcon = /* @__PURE__ */ icon(EyeOff)
export const FailIcon = /* @__PURE__ */ icon(CircleX)
export const FavoriteIcon = /* @__PURE__ */ icon(Heart, filled)
export const FavoriteOutlineIcon = /* @__PURE__ */ icon(Heart)
export const FeaturedIcon = /* @__PURE__ */ icon(Star)
export const FileIcon = /* @__PURE__ */ icon(File)
export const FilesIcon = /* @__PURE__ */ icon(Files)
export const FilesystemIcon = /* @__PURE__ */ icon(Folders)
export const FileTextIcon = /* @__PURE__ */ drawn(
  'M9.5 1.75h-5a1 1 0 0 0-1 1v10.5a1 1 0 0 0 1 1h7a1 1 0 0 0 1-1V4.75ZM9.5 1.75v3h3M5.75 8.5h4.5M5.75 11h4.5',
)
export const FilterClearIcon = /* @__PURE__ */ icon(FunnelX)
export const FilterIcon = /* @__PURE__ */ icon(Funnel)
export const FlaggedIcon = /* @__PURE__ */ icon(Flag)
export const FlaskIcon = /* @__PURE__ */ icon(FlaskConical)
export const FolderIcon = /* @__PURE__ */ drawn(
  'M2 4.5A1.5 1.5 0 0 1 3.5 3h2.6l1.5 1.5h4.9A1.5 1.5 0 0 1 14 6v5.5a1.5 1.5 0 0 1-1.5 1.5h-9A1.5 1.5 0 0 1 2 11.5v-7Z',
)
export const FolderOpenIcon = /* @__PURE__ */ icon(FolderOpen)
export const FolderTreeIcon = /* @__PURE__ */ icon(FolderTree)
export const ForbiddenIcon = /* @__PURE__ */ icon(CircleSlash)
export const ForkIcon = /* @__PURE__ */ icon(GitFork)
export const GearsIcon = /* @__PURE__ */ icon(Cog)
export const GlobeIcon = /* @__PURE__ */ icon(Globe)
export const GovernmentIcon = /* @__PURE__ */ icon(Landmark)
export const GraphIcon = /* @__PURE__ */ icon(Network)
export const GridIcon = /* @__PURE__ */ icon(LayoutGrid)
export const HealthMonitoringIcon = /* @__PURE__ */ icon(Activity)
export const HelpIcon = /* @__PURE__ */ icon(CircleHelp)
export const HistoryIcon = /* @__PURE__ */ icon(History)
export const HomeIcon = /* @__PURE__ */ icon(House)
export const IdCardIcon = /* @__PURE__ */ icon(IdCard)
export const ImageIcon = /* @__PURE__ */ icon(FileImage)
export const ImpersonateIcon = /* @__PURE__ */ icon(HatGlasses)
export const InboxIcon = /* @__PURE__ */ icon(Inbox)
export const IndexIcon = /* @__PURE__ */ icon(DatabaseSearch)
export const InfoIcon = /* @__PURE__ */ drawn(
  'M8 14A6 6 0 1 0 8 2a6 6 0 0 0 0 12ZM8 7.5v3.5M8 5h.01',
)
export const InfrastructureLayersIcon = /* @__PURE__ */ icon(Layers)
export const InputFormIcon = /* @__PURE__ */ icon(TextCursorInput)
export const InstallIcon = /* @__PURE__ */ icon(MonitorDown)
export const InstanceIcon = /* @__PURE__ */ drawn(
  'M4.5 1.75h7a1 1 0 0 1 1 1v10.5a1 1 0 0 1-1 1h-7a1 1 0 0 1-1-1V2.75a1 1 0 0 1 1-1ZM6 4.5h4M6 7h4M8 11.5h.01',
)
export const InstanceTypeIcon = /* @__PURE__ */ icon(MemoryStick)
export const IpAddressIcon = /* @__PURE__ */ drawn(
  'M8 14.25s4.5-4 4.5-7.75a4.5 4.5 0 0 0-9 0C3.5 10.25 8 14.25 8 14.25ZM8 8a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3Z',
)
export const IssueIcon = /* @__PURE__ */ icon(CircleDot)
export const JobIcon = /* @__PURE__ */ icon(ListTodo)
export const JsonIcon = /* @__PURE__ */ drawn(
  'M9.5 1.75h-5a1 1 0 0 0-1 1v10.5a1 1 0 0 0 1 1h7a1 1 0 0 0 1-1V4.75ZM9.5 1.75v3h3M7 7.5c-.6 0-.75.35-.75.85v.5c0 .4-.25.65-.75.65.5 0 .75.25.75.65v.5c0 .5.15.85.75.85M9 7.5c.6 0 .75.35.75.85v.5c0 .4.25.65.75.65-.5 0-.75.25-.75.65v.5c0 .5-.15.85-.75.85',
)
export const KeyboardIcon = /* @__PURE__ */ icon(Keyboard)
export const KeyIcon = /* @__PURE__ */ drawn(
  'M5 13.75a2.75 2.75 0 1 0 0-5.5 2.75 2.75 0 0 0 0 5.5ZM7 9l6-6M11 5l1.5 1.5M9.5 6.5 11 8',
)
export const KubernetesNamespaceIcon = /* @__PURE__ */ icon(SquareDashed)
export const LanguageIcon = /* @__PURE__ */ icon(Languages)
export const LegalIcon = /* @__PURE__ */ icon(Scale)
export const LibraryIcon = /* @__PURE__ */ icon(LibraryBig)
export const LicenseIcon = /* @__PURE__ */ icon(BadgeCheck)
export const LinkIcon = /* @__PURE__ */ drawn(
  'M6.75 9.25a2.5 2.5 0 0 0 3.5 0l2.5-2.5a2.5 2.5 0 0 0-3.5-3.5l-.75.75M9.25 6.75a2.5 2.5 0 0 0-3.5 0l-2.5 2.5a2.5 2.5 0 0 0 3.5 3.5l.75-.75',
)
export const ListViewIcon = /* @__PURE__ */ icon(List)
export const LockIcon = /* @__PURE__ */ icon(Lock)
export const MachineImageIcon = /* @__PURE__ */ icon(Disc3)
export const MailFailedIcon = /* @__PURE__ */ icon(MailX)
export const MailIcon = /* @__PURE__ */ icon(Mail)
export const MailVerifiedIcon = /* @__PURE__ */ icon(MailCheck)
export const MapPinIcon = /* @__PURE__ */ icon(MapPin)
export const MarketplaceIcon = /* @__PURE__ */ icon(Store)
export const MatrixIcon = /* @__PURE__ */ icon(Grid3x3)
export const MegaphoneIcon = /* @__PURE__ */ icon(Megaphone)
export const MFAIcon = /* @__PURE__ */ icon(Smartphone)
export const MigrationIcon = /* @__PURE__ */ icon(DatabaseZap)
export const MinimizeIcon = /* @__PURE__ */ icon(Minimize2)
export const MinusIcon = /* @__PURE__ */ icon(Minus)
export const MlIcon = /* @__PURE__ */ icon(BrainCircuit)
export const MoneyIcon = /* @__PURE__ */ drawn(
  'M8 1.75v12.5M11 4.5H6.75a2 2 0 0 0 0 4h2.5a2 2 0 0 1 0 4H4.75',
)
export const MoonIcon = /* @__PURE__ */ icon(Moon)
export const MoreIcon = /* @__PURE__ */ icon(Ellipsis)
export const MusicIcon = /* @__PURE__ */ icon(Music)
export const MuteIcon = /* @__PURE__ */ icon(BellOff)
export const NavigationIcon = /* @__PURE__ */ icon(Menu)
export const NetworkInterfaceIcon = /* @__PURE__ */ icon(EthernetPort)
export const NewChatIcon = /* @__PURE__ */ icon(SquarePen)
export const NodeIcon = /* @__PURE__ */ drawn(
  'M5 4h6a1 1 0 0 1 1 1v6a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1ZM6.5 6.5h3v3h-3ZM6.5 1.75V4M9.5 1.75V4M6.5 12v2.25M9.5 12v2.25M1.75 6.5H4M1.75 9.5H4M12 6.5h2.25M12 9.5h2.25',
)
export const NotebookIcon = /* @__PURE__ */ icon(NotebookText)
export const NotificationIcon = /* @__PURE__ */ icon(Bell)
export const NotRunningIcon = /* @__PURE__ */ icon(Circle)
export const OnboardingIcon = /* @__PURE__ */ icon(Flag)
export const OpenInNewGraphIcon = /* @__PURE__ */ icon(CornerUpRight)
export const OrganizationIcon = /* @__PURE__ */ icon(Building2)
export const PartnerIcon = /* @__PURE__ */ icon(Handshake)
export const PasswordIcon = /* @__PURE__ */ icon(KeyRound)
export const PauseIcon = /* @__PURE__ */ icon(Pause)
export const PdfIcon = /* @__PURE__ */ icon(FileType)
export const PendingIcon = /* @__PURE__ */ icon(Circle)
export const PhoneIcon = /* @__PURE__ */ icon(Phone)
export const PieChartIcon = /* @__PURE__ */ icon(ChartPie)
export const PinFilledIcon = /* @__PURE__ */ icon(Pin, filled)
export const PinIcon = /* @__PURE__ */ icon(Pin)
export const PowerIcon = /* @__PURE__ */ drawn('M8 1.75V8M11.75 4a5.75 5.75 0 1 1-7.5 0')
export const PowershellIcon = /* @__PURE__ */ icon(SquareChevronRight)
export const PreviewIcon = /* @__PURE__ */ icon(ScanEye)
export const PrintIcon = /* @__PURE__ */ icon(Printer)
export const ProjectIcon = /* @__PURE__ */ icon(FolderKanban)
export const PublishIcon = /* @__PURE__ */ icon(Rocket)
export const PullRequestIcon = /* @__PURE__ */ icon(GitPullRequest)
export const QRCodeIcon = /* @__PURE__ */ icon(QrCode)
export const QueueIcon = /* @__PURE__ */ icon(ListOrdered)
export const QuotaIcon = /* @__PURE__ */ icon(Gauge)
export const RedoIcon = /* @__PURE__ */ icon(Redo2)
export const RefreshIcon = /* @__PURE__ */ drawn(
  'M13 8a5 5 0 0 1-8.9 3.1M3 8a5 5 0 0 1 8.9-3.1M12 2.5v2.5H9.5M4 13.5V11h2.5',
)
export const RemoveIcon = /* @__PURE__ */ icon(X)
export const RemoveUserIcon = /* @__PURE__ */ icon(UserMinus)
export const RenameIcon = /* @__PURE__ */ icon(PencilLine)
export const RenewIcon = /* @__PURE__ */ icon(CalendarSync)
export const ResetLayoutIcon = /* @__PURE__ */ icon(RotateCcwSquare)
export const ResourceGroupIcon = /* @__PURE__ */ icon(Group)
export const ResourceIcon = /* @__PURE__ */ icon(Boxes)
export const RetryIcon = /* @__PURE__ */ drawn('M2.5 8a5.5 5.5 0 1 0 1.6-3.9L2.5 5.5M2.5 2.5v3h3')
export const RoleIcon = /* @__PURE__ */ icon(ShieldUser)
export const RollbackIcon = /* @__PURE__ */ icon(UndoDot)
export const RunningIcon = /* @__PURE__ */ drawn('M14 8a6 6 0 1 1-6-6')
export const RunsIcon = /* @__PURE__ */ icon(ListVideo)
export const RunWorkflowIcon = /* @__PURE__ */ drawn(
  'M8 14A6 6 0 1 0 8 2a6 6 0 0 0 0 12ZM6.5 5.5v5l4-2.5Z',
)
export const SaveIcon = /* @__PURE__ */ drawn(
  'M2.5 3.5a1 1 0 0 1 1-1h7l3 3v7a1 1 0 0 1-1 1h-9a1 1 0 0 1-1-1ZM5 2.5v3h5v-3M5 13.5v-4h6v4',
)
export const SchedulerIcon = /* @__PURE__ */ icon(CalendarClock)
export const ScriptIcon = /* @__PURE__ */ icon(FileCode)
export const SearchIcon = /* @__PURE__ */ drawn(
  'M7 12A5 5 0 1 0 7 2a5 5 0 0 0 0 10ZM14 14l-3.5-3.5',
)
export const SendIcon = /* @__PURE__ */ icon(Send)
export const ServiceIcon = /* @__PURE__ */ icon(Waypoints)
export const SessionIcon = /* @__PURE__ */ icon(MonitorPlay)
export const SettingsIcon = /* @__PURE__ */ drawn(
  'M8 10a2 2 0 1 0 0-4 2 2 0 0 0 0 4ZM13 8a5 5 0 0 0-.1-1l1.4-1.1-1.4-2.4-1.7.6a5 5 0 0 0-1.7-1L9.2 1.3H6.8l-.3 1.8a5 5 0 0 0-1.7 1l-1.7-.6-1.4 2.4L3.1 7a5 5 0 0 0 0 2l-1.4 1.1 1.4 2.4 1.7-.6a5 5 0 0 0 1.7 1l.3 1.8h2.4l.3-1.8a5 5 0 0 0 1.7-1l1.7.6 1.4-2.4L12.9 9c.07-.33.1-.66.1-1Z',
)
export const ShareIcon = /* @__PURE__ */ icon(Share2)
export const ShieldIcon = /* @__PURE__ */ drawn(
  'M8 1.75 13 3.5v4c0 3-2.15 5.25-5 6.75-2.85-1.5-5-3.75-5-6.75v-4Z',
)
export const ShieldOffIcon = /* @__PURE__ */ icon(ShieldOff)
export const ShrinkIcon = /* @__PURE__ */ icon(Minimize)
export const SidebarCloseIcon = /* @__PURE__ */ icon(PanelLeftClose)
export const SidebarIcon = /* @__PURE__ */ icon(PanelLeft)
export const SidebarOpenIcon = /* @__PURE__ */ icon(PanelLeftOpen)
export const SignInIcon = /* @__PURE__ */ icon(LogIn)
export const SignOutIcon = /* @__PURE__ */ icon(LogOut)
export const SkipIcon = /* @__PURE__ */ icon(CircleMinus)
export const SnapshotIcon = /* @__PURE__ */ drawn(
  'M2 5.5a1 1 0 0 1 1-1h2l1-1.75h4L11 4.5h2a1 1 0 0 1 1 1v7a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1ZM8 11a2.25 2.25 0 1 0 0-4.5A2.25 2.25 0 0 0 8 11Z',
)
export const SortDownIcon = /* @__PURE__ */ icon(ArrowDownWideNarrow)
export const SortUnsortedIcon = /* @__PURE__ */ icon(ArrowUpDown)
export const SortUpIcon = /* @__PURE__ */ icon(ArrowUpNarrowWide)
export const SparklesIcon = /* @__PURE__ */ icon(Sparkles)
export const SplitIcon = /* @__PURE__ */ icon(SquareSplitHorizontal)
export const SpreadsheetIcon = /* @__PURE__ */ icon(Sheet)
export const StartIcon = /* @__PURE__ */ drawn('M4.5 2.75v10.5L13 8Z')
export const StopIcon = /* @__PURE__ */ icon(Square)
export const StorageIcon = /* @__PURE__ */ icon(Database)
export const SubdomainIcon = /* @__PURE__ */ icon(AtSign)
export const SuccessIcon = /* @__PURE__ */ icon(CircleCheck)
export const SummaryIcon = /* @__PURE__ */ icon(ScrollText)
export const SunIcon = /* @__PURE__ */ icon(Sun)
export const SupportIcon = /* @__PURE__ */ icon(Headset)
export const SwapIcon = /* @__PURE__ */ icon(ArrowLeftRight)
export const TagIcon = /* @__PURE__ */ icon(Tag)
export const TerminalIcon = /* @__PURE__ */ drawn('M3 4.5 6.5 8 3 11.5M8 12h5')
export const ThinkingIcon = /* @__PURE__ */ icon(Brain)
export const TodoIcon = /* @__PURE__ */ icon(ClipboardPen)
export const ToolsIcon = /* @__PURE__ */ icon(Wrench)
export const TrashIcon = /* @__PURE__ */ drawn(
  'M2.5 4h11M6 4V2.75A.75.75 0 0 1 6.75 2h2.5a.75.75 0 0 1 .75.75V4M4 4l.65 9.05a1 1 0 0 0 1 .95h4.7a1 1 0 0 0 1-.95L12 4M6.75 7v4M9.25 7v4',
)
export const TunnelIcon = /* @__PURE__ */ drawn(
  'M4 14a1.75 1.75 0 1 0 0-3.5A1.75 1.75 0 0 0 4 14ZM12 5.5A1.75 1.75 0 1 0 12 2a1.75 1.75 0 0 0 0 3.5ZM5.75 12.25h5a2.25 2.25 0 0 0 0-4.5h-5.5a2.25 2.25 0 0 1 0-4.5h5',
)
export const UndoIcon = /* @__PURE__ */ icon(Undo2)
export const UnfavoriteIcon = /* @__PURE__ */ icon(HeartOff)
export const UnlinkIcon = /* @__PURE__ */ icon(Unlink)
export const UnmuteIcon = /* @__PURE__ */ icon(BellRing)
export const UploadIcon = /* @__PURE__ */ drawn(
  'M8 10.5V2.5M4.75 5.5 8 2.25l3.25 3.25M2.5 10.5v2a1 1 0 0 0 1 1h9a1 1 0 0 0 1-1v-2',
)
export const UserIcon = /* @__PURE__ */ drawn(
  'M8 8a2.75 2.75 0 1 0 0-5.5A2.75 2.75 0 0 0 8 8ZM2.75 13.75c.6-2.4 2.7-3.75 5.25-3.75s4.65 1.35 5.25 3.75',
)
export const UsersIcon = /* @__PURE__ */ drawn(
  'M6 7.5a2.25 2.25 0 1 0 0-4.5 2.25 2.25 0 0 0 0 4.5ZM1.75 13c.5-2 2.1-3.25 4.25-3.25S9.75 11 10.25 13M10.5 3.1a2.25 2.25 0 0 1 0 4.3M11.75 9.9c1.2.45 2.1 1.5 2.5 3.1',
)
export const UserWorkspaceIcon = /* @__PURE__ */ icon(SquareTerminal)
export const VideoIcon = /* @__PURE__ */ icon(Video)
export const WarningIcon = /* @__PURE__ */ drawn(
  'M7.13 2.5a1 1 0 0 1 1.74 0l5.5 9.75a1 1 0 0 1-.87 1.5H2.5a1 1 0 0 1-.87-1.5ZM8 6.5v2.75M8 11.25h.01',
)
export const WebhookIcon = /* @__PURE__ */ icon(Webhook)
export const ZapIcon = /* @__PURE__ */ icon(Zap)
export const ZipIcon = /* @__PURE__ */ icon(FileArchive)
export const ZoomInIcon = /* @__PURE__ */ icon(ZoomIn)
export const ZoomOutIcon = /* @__PURE__ */ icon(ZoomOut)
export { ErrorCheckmark, SuccessCheckmark } from './components/StatusIcons'
