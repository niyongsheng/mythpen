import type { Chapter } from '@/types'

/** Chapter status cycle: pending → writing → review → accepted → pending */
export const NEXT_STATUS: Partial<Record<Chapter['status'], Chapter['status']>> = {
  pending: 'writing',
  writing: 'review',
  review: 'accepted',
  accepted: 'pending',
}
