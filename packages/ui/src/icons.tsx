// Import icons from here, never from 'react-icons/*' directly.
import cx from 'classnames'
import type { IconBaseProps } from 'react-icons'
import { BiError as ErrorIcon } from 'react-icons/bi'
import {
  BsZoomIn as ChartZoomIcon,
  BsLayers as InfrastructureLayersIcon,
  BsCurrencyDollar as MoneyIcon,
} from 'react-icons/bs'
import {
  FaInfoCircle as InfoIcon,
  FaCircleNotch as UnexportedLoaderIcon,
} from 'react-icons/fa'
export type { IconType } from 'react-icons'
export { AiOutlineRollback as RollbackIcon } from 'react-icons/ai'
export {
  BiBell as UnmuteIcon,
  BiBellOff as MuteIcon,
  BiExpandVertical as ExpandVerticalIcon,
  BiBuildings as OrganizationIcon,
  BiPause as PauseIcon,
  BiSolidCheckShield as ShieldIcon,
  BiPlay as StartIcon,
  BiStop as StopIcon,
  BiSolidTrashAlt as TrashIcon,
  BiUndo as UndoIcon,
  BiRedo as RedoIcon,
} from 'react-icons/bi'
export {
  BsStar as PinIcon,
  BsStarFill as PinFilledIcon,
  BsGrid as GridIcon,
  BsBucket as BucketIcon,
  BsArrowsCollapse as CollapseIcon,
  BsThreeDotsVertical as MenuIcon,
  BsThreeDots as MoreIcon,
  BsSearch as SearchOutlineIcon,
  BsTerminalFill as UserWorkspaceFillIcon,
  BsTerminal as UserWorkspaceIcon,
  BsFileEarmarkZip as ZipIcon,
  BsMusicNoteBeamed as MusicIcon,
  BsStopCircle as StopCircleIcon,
} from 'react-icons/bs'
export {
  FaAmazon as AmazonIcon,
  FaCentos as CentOSIcon,
  FaChrome as ChromeIcon,
  FaCog as CogIcon,
  FaEdge as EdgeIcon,
  FaFirefoxBrowser as FirefoxIcon,
  FaOpera as OperaIcon,
  FaSafari as SafariIcon,
  FaExclamationTriangle as WarningTriangleIcon,
  FaFile as FileSolidIcon,
  FaFilePdf as PdfSolidIcon,
  FaFolder as FolderSolidIcon,
  FaGithub as GitHubIcon,
  FaGitlab as GitLabIcon,
  FaLinkedin as LinkedInIcon,
  FaImage as ImageSolidIcon,
  FaLinux as LinuxIcon,
  FaPaperclip as AttachmentIcon,
  FaRedhat as RedHatIcon,
  FaRobot as RobotIcon,
  FaShieldAlt as ShieldAltIcon,
  FaStop as StopSolidIcon,
  FaSuse as SuseIcon,
  FaUbuntu as UbuntuIcon,
  FaUsers as AccessIcon,
  FaPlus as AddIcon,
  FaAngleDown as AngleDownIcon,
  FaAngleLeft as AngleLeftIcon,
  FaAngleRight as AngleRightIcon,
  FaAngleUp as AngleUpIcon,
  FaArrowDown as ArrowDownIcon,
  FaArrowLeft as ArrowLeftIcon,
  FaArrowRight as ArrowRightIcon,
  FaArrowUp as ArrowUpIcon,
  FaCaretDown as CaretDownIcon,
  FaChartLine as ChartIcon,
  FaComments as ChatIcon,
  FaCheck as CheckIcon,
  FaChevronDown as ChevronDownIcon,
  FaChevronUp as ChevronUpIcon,
  FaCloud as CloudIcon,
  FaDollarSign as CostDashboardIcon,
  FaDocker as DockerIcon,
  FaCloudDownloadAlt as DownloadIcon,
  FaEdit as EditIcon,
  FaRunning as ExecuteWorkflow,
  FaExpand as ExpandIcon,
  FaFilter as FilterIcon,
  FaFlask as FlaskIcon,
  FaRegFolder as FolderIcon,
  FaCogs as GearsIcon,
  FaGlobe as GlobeIcon,
  FaEye as HiddenFalseIcon,
  FaEyeSlash as HiddenTrueIcon,
  FaRegFileImage as ImageIcon,
  FaKey as KeyIcon,
  FaLink as LinkIcon,
  FaLock as LockIcon,
  FaGlobeAmericas as MarketplaceIcon,
  FaRegCircle as NotRunningIcon,
  FaOpenid as OIDCIcon,
  FaRocket as PartnerIcon,
  FaKey as PasswordIcon,
  FaChartPie as PieChartIcon,
  FaPowerOff as PowerIcon,
  FaPrint as PrintIcon,
  FaGlobeAmericas as PublishIcon,
  FaQrcode as QRCodeIcon,
  FaLayerGroup as ResourceGroupIcon,
  FaUndoAlt as RetryIcon,
  FaSave as SaveIcon,
  FaList as SchedulerIcon,
  FaSearch as SearchIcon,
  FaUsers as SharingIcon,
  FaCompress as ShrinkIcon,
  FaDesktop as SnapshotIcon,
  FaSlack as SlackIcon,
  FaTerminal as TerminalIcon,
  FaTimes as TimesIcon,
  FaQuestionCircle as UserGuideIcon,
  FaStar as FeaturedIcon,
  FaUser as UserIcon,
  FaUsers as UsersIcon,
  FaWindows as WindowsIcon,
  FaMinus as MinusIcon,
} from 'react-icons/fa'
export {
  FaApple as AppleIcon,
  FaArrowsRotate as RefreshArrowsIcon,
  FaDebian as DebianIcon,
  FaWandMagicSparkles as CustomizeIcon,
  FaFilterCircleXmark as FilterClearIcon,
  FaRegFolderOpen as FolderOpenIcon,
  FaLocationDot as IpAddressIcon,
  FaUpRightFromSquare as NewWindowIcon,
  FaXTwitter as XTwitterIcon,
  FaInbox as NotificationInboxIcon,
  FaRegFilePdf as PdfIcon,
} from 'react-icons/fa6'
export {
  FiAlertCircle as AlertCircleIcon,
  FiActivity as HealthMonitoringIcon,
  FiChevronDown as ChevronDownStrokeIcon,
  FiClock as ClockIcon,
  FiHardDrive as DiskIcon,
  FiDownload as DownloadFileIcon,
  FiFile as FileIcon,
  FiFileText as FileTextIcon,
  FiRotateCcw as HistoryIcon,
  FiUpload as UploadIcon,
  FiZap as ZapIcon,
} from 'react-icons/fi'
export { GiSpy as ImpersonateIcon } from 'react-icons/gi'
export {
  GoPlus as PlusOutlineIcon,
  GoSkip as ForbiddenIcon,
  GoRepoForked as ForkIcon,
  GoSignOut as SignOutIcon,
  GoVideo as VideoIcon,
} from 'react-icons/go'
export {
  GrServerCluster as ClusterIcon,
  GrCloudComputer as ComputeIcon,
  GrInbox as InboxIcon,
  GrTasks as MonitorIcon,
  GrStorage as StorageIcon,
} from 'react-icons/gr'
export {
  HiOutlineArchive as ArchiveIcon,
  HiOutlineClipboardCopy as ClipboardIcon,
  HiDuplicate as DuplicateIcon,
  HiCog as GearIcon,
  HiOutlineHome as HomeIcon,
  HiServer as ServerIcon,
  HiQuestionMarkCircle as TooltipIcon,
} from 'react-icons/hi'
import { HiMiniCheckCircle as SuccessIcon } from 'react-icons/hi2'
export { SuccessIcon }
export {
  HiMiniLanguage as LanguageIcon,
  HiMiniXCircle as FailIcon,
  HiMiniMinusCircle as SkipIcon,
  HiSparkles as SparklesIcon,
} from 'react-icons/hi2'
export { ImSpinner5 as RunningIcon } from 'react-icons/im'
export {
  IoMdBuild as BuildWorkflowIcon,
  IoMdClose as CloseIcon,
  IoIosNotifications as NotificationFillIcon,
} from 'react-icons/io'
export {
  IoCloudUploadOutline as CloudUploadIcon,
  IoDocumentTextOutline as DocumentIcon,
  IoHeart as FavoriteIcon,
  IoHeartOutline as FavoriteOutlineIcon,
  IoFileTrayFullOutline as FilesystemIcon,
  IoInformationCircleOutline as InfoCircleIcon,
  IoSettingsOutline as SettingsIcon,
  IoHeartDislike as UnfavoriteIcon,
  IoWarningOutline as WarningIcon,
} from 'react-icons/io5'
export {
  LuArrowRight as ArrowRightStrokeIcon,
  LuBadgeCheck as LicenseIcon,
  LuCalendar as CalendarIcon,
  LuCheck as CheckStrokeIcon,
  LuChevronLeft as ChevronLeftIcon,
  LuChevronRight as ChevronRightIcon,
  LuLogs as EventsIcon,
  LuSettings2 as DisplayIcon,
  LuExternalLink as ExternalLink,
  LuEye as EyeIcon,
  LuEyeOff as EyeOffIcon,
  LuFolderTree as FolderTreeIcon,
  LuIdCard as IdCardIcon,
  LuMail as MailIcon,
  LuMegaphone as MegaphoneIcon,
  LuMoon as MoonIcon,
  LuBrainCircuit as MlIcon,
  LuShield as ShieldOutlineIcon,
  LuSheet as SpreadsheetIcon,
  LuSun as SunIcon,
  LuX as XStrokeIcon,
  LuZoomIn as ZoomInIcon,
  LuZoomOut as ZoomOutIcon,
  LuNetwork as GraphIcon,
  LuTextCursorInput as InputFormIcon,
  LuCode as CodeIcon,
  LuKeyboard as KeyboardIcon,
  LuBraces as ExpressionIcon,
} from 'react-icons/lu'
export {
  MdClear as ClearIcon,
  MdDragHandle as DragHandleIcon,
  MdInstallDesktop as InstallIcon,
  MdSmartphone as MFA,
  MdOutlineMoneyOff as DisableCostIcon,
  MdOutlineAttachMoney as EnableCostIcon,
  MdPieChart as QuotaIcon,
  MdRefresh as RefreshIcon,
  MdReplay as ReplayIcon,
} from 'react-icons/md'
export {
  PiArrowBendUpRightBold as OpenInNewGraphIcon,
  PiPlugsConnectedFill as ConnectIcon,
  PiRectangleDashed as KubernetesNamespaceIcon,
  PiShareBold as ShareIcon,
} from 'react-icons/pi'
export {
  SiAnthropic as AnthropicIcon,
  SiHelm as HelmIcon,
  SiKubernetes as KubernetesIcon,
  SiOpenai as OpenAIIcon,
} from 'react-icons/si'
export {
  TbAlertTriangleFilled as AlertFillIcon,
  TbAlertTriangle as AlertIcon,
  TbApi as APIIcon,
  TbUserOff as DisableUserIcon,
  TbUser as EnableUserIcon,
  TbWorldShare as EndpointIcon,
  TbEdit as NewChatIcon,
  TbLayoutSidebarRightCollapse as SidebarCloseIcon,
  TbLayoutSidebar as SidebarIcon,
  TbLayoutSidebarLeftCollapse as SidebarOpenIcon,
  TbWorldWww as SubdomainIcon,
  TbBrain as ThinkingIcon,
  TbBuildingTunnel as TunnelIcon,
} from 'react-icons/tb'
export {
  TiCancel as CancelIcon,
  TiArrowSortedDown as SortDownIcon,
  TiArrowUnsorted as SortUnsortedIcon,
  TiArrowSortedUp as SortUpIcon,
} from 'react-icons/ti'
export {
  VscPass as CheckMarkIcon,
  VscLayoutSidebarLeft as EditorIcon,
  VscJson as JsonIcon,
  VscChromeMinimize as MinimizeIcon,
  VscTerminalPowershell as PowershellIcon,
  VscTerminalPowershell as RunWorkflowIcon,
  VscSplitHorizontal as SplitIcon,
} from 'react-icons/vsc'
export { FiCopy as CopyIcon, FiX as XIcon } from 'react-icons/fi'
export {
  ChartZoomIcon,
  InfrastructureLayersIcon,
  ErrorIcon,
  InfoIcon,
  MoneyIcon,
}
interface IBaseCheckmarkProps {
  className?: string
  colored?: boolean
}

export function SuccessCheckmark({
  className,
  colored = true,
}: IBaseCheckmarkProps) {
  return <SuccessIcon className={cx(colored && 'text-green-500', className)} />
}

export function ErrorCheckmark({
  className,
  colored = true,
}: IBaseCheckmarkProps) {
  return <ErrorIcon className={cx(colored && 'text-red-400', className)} />
}

export function LoaderIcon({
  className,
  ...props
}: IconBaseProps & { className?: string }) {
  return (
    <UnexportedLoaderIcon
      className={cx('animate-spin', className)}
      {...props}
    />
  )
}
