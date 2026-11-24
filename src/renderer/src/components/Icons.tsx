import type { ComponentType } from 'react'
import {
  AtSign,
  Bell,
  Calendar,
  ChevronRight,
  CircleAlert,
  CircleCheck,
  CircleDollarSign,
  Command,
  Cpu,
  File,
  Folder,
  GitCompareArrows,
  Info,
  Keyboard,
  MessageSquareCode,
  Music2,
  PanelLeft,
  PanelRight,
  Plug,
  Plus,
  RefreshCw,
  Search,
  SendHorizontal,
  Settings,
  Square,
  Pause,
  Trash2,
  TriangleAlert,
  Trophy,
  User,
  Users,
  X,
  type LucideProps
} from 'lucide-react'

// Ícones do app: lucide-react (ISC) com traço e tamanho padronizados. Sempre decorativos (aria-hidden):
// o rótulo acessível fica no botão que os contém.

type P = { size?: number }

const wrap = (Icon: ComponentType<LucideProps>) => {
  const Wrapped = ({ size = 18 }: P) => <Icon size={size} strokeWidth={1.75} aria-hidden="true" focusable="false" />
  Wrapped.displayName = `Icon(${Icon.displayName ?? 'lucide'})`
  return Wrapped
}

export const IconChat = wrap(MessageSquareCode)
export const IconDiff = wrap(GitCompareArrows)
export const IconPlug = wrap(Plug)
export const IconCoin = wrap(CircleDollarSign)
export const IconGear = wrap(Settings)
export const IconFolder = wrap(Folder)
export const IconFile = wrap(File)
export const IconPlus = wrap(Plus)
export const IconX = wrap(X)
export const IconChevron = wrap(ChevronRight)
export const IconSend = wrap(SendHorizontal)
export const IconStop = wrap(Square)
export const IconRefresh = wrap(RefreshCw)
export const IconMusic = wrap(Music2)
export const IconTrash = wrap(Trash2)
export const IconAt = wrap(AtSign)
export const IconUser = wrap(User)
export const IconUsers = wrap(Users)
export const IconCalendar = wrap(Calendar)
export const IconSearch = wrap(Search)
export const IconCommand = wrap(Command)
export const IconKeyboard = wrap(Keyboard)
export const IconPanelLeft = wrap(PanelLeft)
export const IconPanelRight = wrap(PanelRight)
export const IconBell = wrap(Bell)
export const IconCpu = wrap(Cpu)
export const IconPause = wrap(Pause)
// Notificações (H06.2): um ícone por tipo.
export const IconErro = wrap(CircleAlert)
export const IconAviso = wrap(TriangleAlert)
export const IconSucesso = wrap(CircleCheck)
export const IconInfo = wrap(Info)
export const IconConquista = wrap(Trophy)
