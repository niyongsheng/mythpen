import {
  BookOpen,
  Building,
  Fingerprint,
  Gamepad2,
  Heart,
  Landmark,
  type LucideIcon,
  Mountain,
  Rocket,
  Scroll,
  Swords,
  Wand,
} from 'lucide-react'

const ICON_MAP: Record<string, LucideIcon> = {
  Rocket,
  Wand,
  Mountain,
  Swords,
  Heart,
  Landmark,
  Building,
  Fingerprint,
  Gamepad2,
  BookOpen,
  Scroll,
}

export function ProjectIcon({ name, className = 'w-5 h-5' }: { name?: string; className?: string }) {
  const Icon = name ? ICON_MAP[name] : undefined
  if (Icon) return <Icon className={className} />
  // fallback
  return <BookOpen className={className} />
}
