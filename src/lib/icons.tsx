// Named imports, never `import * as`: a namespace import of iconsax-react drags
// the whole 18 MB icon set into the client bundle, since nothing can be
// tree-shaken out of a namespace object.
import {
  Add as RawAdd,
  Archive as RawArchive,
  ArrowDown as RawArrowDown,
  ArrowDown2 as RawArrowDown2,
  ArrowLeft as RawArrowLeft,
  ArrowRight as RawArrowRight,
  Briefcase as RawBriefcase,
  Calendar as RawCalendar,
  Card as RawCard,
  Category as RawCategory,
  Chart as RawChart,
  ClipboardTick as RawClipboardTick,
  Clock as RawClock,
  CloseCircle as RawCloseCircle,
  ConvertCard as RawConvertCard,
  Dash as RawDash,
  Document as RawDocument,
  Eye as RawEye,
  EyeSlash as RawEyeSlash,
  Flash as RawFlash,
  I3Dcube as RawI3Dcube,
  Lock1 as RawLock1,
  Logout as RawLogout,
  Menu as RawMenu,
  Message as RawMessage,
  Minus as RawMinus,
  People as RawPeople,
  SearchNormal1 as RawSearchNormal1,
  Setting as RawSetting,
  Setting2 as RawSetting2,
  Shield as RawShield,
  ShoppingCart as RawShoppingCart,
  Tag as RawTag,
  TickCircle as RawTickCircle,
  Trash as RawTrash,
  User as RawUser,
  UserAdd as RawUserAdd,
  Warning2 as RawWarning2,
} from 'iconsax-react'
import type { IconProps, Icon } from 'iconsax-react'

/**
 * iconsax-react sets its defaults (color, size, variant) via `Component.defaultProps`
 * on forwardRef components. The React canary that Next's App Router renders with no
 * longer applies `defaultProps` for forwardRef/function components, so any icon used
 * without an explicit `color` silently renders with no fill/stroke and is invisible.
 * Wrap every icon we use so `color` always falls back to `currentColor` in JS,
 * independent of React's (deprecated) defaultProps resolution.
 */
function withDefaultColor(IconComponent: Icon): Icon {
  const Wrapped = ({ color = 'currentColor', ...rest }: IconProps) => (
    <IconComponent color={color} {...rest} />
  )
  Wrapped.displayName = `Icon(${IconComponent.displayName ?? 'unknown'})`
  return Wrapped
}

export const Add = withDefaultColor(RawAdd)
export const Archive = withDefaultColor(RawArchive)
export const ArrowDown = withDefaultColor(RawArrowDown)
export const ArrowDown2 = withDefaultColor(RawArrowDown2)
export const ArrowLeft = withDefaultColor(RawArrowLeft)
export const ArrowRight = withDefaultColor(RawArrowRight)
export const Briefcase = withDefaultColor(RawBriefcase)
export const Calendar = withDefaultColor(RawCalendar)
export const Card = withDefaultColor(RawCard)
export const Category = withDefaultColor(RawCategory)
export const Chart = withDefaultColor(RawChart)
export const ClipboardTick = withDefaultColor(RawClipboardTick)
export const Clock = withDefaultColor(RawClock)
export const CloseCircle = withDefaultColor(RawCloseCircle)
export const ConvertCard = withDefaultColor(RawConvertCard)
export const Dash = withDefaultColor(RawDash)
export const Document = withDefaultColor(RawDocument)
export const Eye = withDefaultColor(RawEye)
export const EyeSlash = withDefaultColor(RawEyeSlash)
export const Flash = withDefaultColor(RawFlash)
export const I3Dcube = withDefaultColor(RawI3Dcube)
export const Lock1 = withDefaultColor(RawLock1)
export const Logout = withDefaultColor(RawLogout)
export const Menu = withDefaultColor(RawMenu)
export const Message = withDefaultColor(RawMessage)
export const Minus = withDefaultColor(RawMinus)
export const People = withDefaultColor(RawPeople)
export const SearchNormal1 = withDefaultColor(RawSearchNormal1)
export const Setting = withDefaultColor(RawSetting)
export const Setting2 = withDefaultColor(RawSetting2)
export const Shield = withDefaultColor(RawShield)
export const ShoppingCart = withDefaultColor(RawShoppingCart)
export const Tag = withDefaultColor(RawTag)
export const TickCircle = withDefaultColor(RawTickCircle)
export const Trash = withDefaultColor(RawTrash)
export const User = withDefaultColor(RawUser)
export const UserAdd = withDefaultColor(RawUserAdd)
export const Warning2 = withDefaultColor(RawWarning2)
