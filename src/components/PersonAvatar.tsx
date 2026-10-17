import { memo } from 'react'

interface PersonAvatarProps {
  /** Person ID: 'person-a' (Lingling) or 'person-b' (Lianlian) */
  personId: string
  /** Avatar size in pixels: 32, 40, 48, 52, 56, 60, 72 */
  size?: 32 | 40 | 48 | 52 | 56 | 60 | 72
  /** Optional className for additional styling */
  className?: string
}

/**
 * Unified person avatar component.
 * - person-a / Lingling: crystal green gradient, displays "玲"
 * - person-b / Lianlian: crystal pink gradient, displays "恋"
 *
 * All avatars share the same circular shape, crystal border, shadow, and font.
 * Only the size and person-specific colors differ.
 */
const PersonAvatar = memo(function PersonAvatar({ personId, size = 40, className = '' }: PersonAvatarProps) {
  const isLingling = personId === 'person-a'
  const isLianlian = personId === 'person-b'
  const theme = isLingling ? 'lingling' : isLianlian ? 'lianlian' : undefined
  const initial = isLingling ? '玲' : isLianlian ? '恋' : '?'

  const sizeClass = {
    32: 'avatar-32',
    40: 'avatar-40',
    48: 'avatar-48',
    52: 'avatar-52',
    56: 'avatar-56',
    60: 'avatar-60',
    72: 'avatar-72',
  }[size]

  return (
    <div
      className={`person-avatar-unified ${sizeClass} ${className}`}
      data-theme={theme}
    >
      {initial}
    </div>
  )
})

export default PersonAvatar
