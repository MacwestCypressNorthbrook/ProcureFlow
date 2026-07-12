import * as Iconsax from 'iconsax-react'
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

export const Add = withDefaultColor(Iconsax.Add)
export const Archive = withDefaultColor(Iconsax.Archive)
export const ArrowDown = withDefaultColor(Iconsax.ArrowDown)
export const ArrowDown2 = withDefaultColor(Iconsax.ArrowDown2)
export const ArrowLeft = withDefaultColor(Iconsax.ArrowLeft)
export const ArrowRight = withDefaultColor(Iconsax.ArrowRight)
export const Briefcase = withDefaultColor(Iconsax.Briefcase)
export const Calendar = withDefaultColor(Iconsax.Calendar)
export const Card = withDefaultColor(Iconsax.Card)
export const Category = withDefaultColor(Iconsax.Category)
export const Chart = withDefaultColor(Iconsax.Chart)
export const ClipboardTick = withDefaultColor(Iconsax.ClipboardTick)
export const Clock = withDefaultColor(Iconsax.Clock)
export const CloseCircle = withDefaultColor(Iconsax.CloseCircle)
export const ConvertCard = withDefaultColor(Iconsax.ConvertCard)
export const Dash = withDefaultColor(Iconsax.Dash)
export const Document = withDefaultColor(Iconsax.Document)
export const Eye = withDefaultColor(Iconsax.Eye)
export const EyeSlash = withDefaultColor(Iconsax.EyeSlash)
export const Flash = withDefaultColor(Iconsax.Flash)
export const I3Dcube = withDefaultColor(Iconsax.I3Dcube)
export const Lock1 = withDefaultColor(Iconsax.Lock1)
export const Logout = withDefaultColor(Iconsax.Logout)
export const Menu = withDefaultColor(Iconsax.Menu)
export const Message = withDefaultColor(Iconsax.Message)
export const Minus = withDefaultColor(Iconsax.Minus)
export const People = withDefaultColor(Iconsax.People)
export const SearchNormal1 = withDefaultColor(Iconsax.SearchNormal1)
export const Setting = withDefaultColor(Iconsax.Setting)
export const Setting2 = withDefaultColor(Iconsax.Setting2)
export const Shield = withDefaultColor(Iconsax.Shield)
export const ShoppingCart = withDefaultColor(Iconsax.ShoppingCart)
export const Tag = withDefaultColor(Iconsax.Tag)
export const TickCircle = withDefaultColor(Iconsax.TickCircle)
export const Trash = withDefaultColor(Iconsax.Trash)
export const User = withDefaultColor(Iconsax.User)
export const UserAdd = withDefaultColor(Iconsax.UserAdd)
export const Warning2 = withDefaultColor(Iconsax.Warning2)
