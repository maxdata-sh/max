import type { EntityType } from '@max/core'
import type { Prompter } from '../../prompter.js'
import type { SyncProgressEvent } from '@max/execution'

// ============================================================================
// Constants
// ============================================================================

const BAR_WIDTH = 5
const PHASES_PER_BLOCK = 5
const TOTAL_PHASES = BAR_WIDTH * PHASES_PER_BLOCK // 25
const PHASE_CHARS = ['\x1b[2m·\x1b[22m', '░', '▒', '▓', '█']
const RATE_WINDOW = 10 // sliding window size for ops/s calculation
const NAME_WIDTH = 20

// ============================================================================
// Per-entity progress state
// ============================================================================

interface EntityProgress {
  count: number
  failed: number
  phase: number // 0 to TOTAL_PHASES-1, wraps cyclically
  recentTimestamps: number[] // ring buffer for rate calc
}

// ============================================================================
// Terminal progress renderer
// ============================================================================

export class SyncProgressRenderer {
  private entities = new Map<EntityType, EntityProgress>()
  private startedAt = Date.now()
  private lastLineCount = 0

  constructor(private prompter: Prompter) {}

  onEvent(event: SyncProgressEvent): void {
    switch (event.kind) {
      case 'sync-started':
        this.prompter.write('Syncing...\n')
        break

      case 'task-completed': {
        const entry = this.getOrCreate(event.entityType)
        const count = event.count ?? 1
        entry.count += count
        entry.phase = (entry.phase + count) % TOTAL_PHASES
        entry.recentTimestamps.push(Date.now())
        if (entry.recentTimestamps.length > RATE_WINDOW) {
          entry.recentTimestamps.shift()
        }
        this.render()
        break
      }

      case 'task-failed': {
        const entry = this.getOrCreate(event.entityType)
        entry.failed++
        entry.recentTimestamps.push(Date.now())
        if (entry.recentTimestamps.length > RATE_WINDOW) {
          entry.recentTimestamps.shift()
        }
        this.render()
        break
      }
    }
  }

  finish(): void {
    // Leave the final frame visible - don't clear it
    this.lastLineCount = 0
    this.prompter.write('\n')
  }

  // ============================================================================
  // Rendering
  // ============================================================================

  private render(): void {
    this.clearPreviousFrame()

    const lines: string[] = []

    for (const [entityType, progress] of this.entities) {
      const name = String(entityType).padEnd(NAME_WIDTH)
      const bar = renderBar(progress.phase)
      const count = String(progress.count).padStart(6)
      const rate = renderRate(progress.recentTimestamps)
      const failStr = progress.failed > 0 ? `  \x1b[31m${progress.failed} failed\x1b[39m` : ''
      lines.push(`  ${name} ${bar} ${count}  ${rate}${failStr}`)
    }

    const elapsed = ((Date.now() - this.startedAt) / 1000).toFixed(1)
    lines.push(`  ${'─'.repeat(46)}`)
    lines.push(`  ${elapsed}s elapsed`)

    const output = lines.join('\n') + '\n'
    this.prompter.write(output)
    this.lastLineCount = lines.length
  }

  private clearPreviousFrame(): void {
    if (this.lastLineCount > 0) {
      this.prompter.write(`\x1b[${this.lastLineCount}A\x1b[0J`)
    }
  }

  private getOrCreate(entityType: EntityType): EntityProgress {
    let entry = this.entities.get(entityType)
    if (!entry) {
      entry = { count: 0, failed: 0, phase: 0, recentTimestamps: [] }
      this.entities.set(entityType, entry)
    }
    return entry
  }
}

// ============================================================================
// Bar rendering
// ============================================================================

function renderBar(phase: number): string {
  let bar = ''
  for (let i = 0; i < BAR_WIDTH; i++) {
    const blockPhase = Math.min(Math.max(phase - i * PHASES_PER_BLOCK, 0), PHASES_PER_BLOCK)
    bar += PHASE_CHARS[blockPhase]
  }
  return bar
}

// ============================================================================
// Rate rendering
// ============================================================================

function renderRate(timestamps: number[]): string {
  if (timestamps.length < 2) return '     —'
  const oldest = timestamps[0]
  const newest = timestamps[timestamps.length - 1]
  const elapsed = (newest - oldest) / 1000
  if (elapsed < 0.001) return '     —'
  const rate = (timestamps.length - 1) / elapsed
  return `${rate.toFixed(1).padStart(5)} op/s`
}
