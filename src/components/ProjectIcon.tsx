import { BookOpen, Building, Heart, Landmark, type LucideIcon, Rocket, Scroll, Wand, Zap } from 'lucide-react'

const ICON_MAP: Record<string, LucideIcon> = {
  Rocket,
  Wand,
  Heart,
  Landmark,
  Building,
  Zap,
  BookOpen,
  Scroll,
}

export function ProjectIcon({ name, className = 'w-5 h-5' }: { name?: string; className?: string }) {
  const Icon = name ? ICON_MAP[name] : undefined
  if (Icon) return <Icon className={className} />
  // fallback
  return <BookOpen className={className} />
}
