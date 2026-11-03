// Activation milestones are once-per-install, not once-per-session: the
// anonymous analytics id changes daily, so a local marker is the only way to
// keep "first project / first chapter / first AI reply" meaningful.
import { track } from '@/lib/analytics'

const MILESTONES_KEY = 'mythpen-analytics-milestones'
const seen = new Set<string>()

export function trackMilestone(milestone: string, projectKey?: string | null): void {
  if (seen.has(milestone)) return
  seen.add(milestone)
  try {
    const raw = localStorage.getItem(MILESTONES_KEY)
    const done: string[] = raw ? JSON.parse(raw) : []
    if (Array.isArray(done) && done.includes(milestone)) return
    localStorage.setItem(MILESTONES_KEY, JSON.stringify([...done, milestone]))
  } catch {
    // Storage can be unavailable; the in-memory set still prevents duplicates.
  }
  track('milestone_reached', projectKey ? { milestone, project_key: projectKey } : { milestone })
}
