/** Chapter status cycle: pending → writing → review → accepted → pending */
export const NEXT_STATUS: Record<string, string> = {
  pending: 'writing',
  writing: 'review',
  review: 'accepted',
  accepted: 'pending',
}
