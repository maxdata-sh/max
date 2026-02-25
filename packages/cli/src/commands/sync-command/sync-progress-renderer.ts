import type { EntityType } from '@max/core'
import type { Prompter } from '../../prompter.js'
import type { SyncProgressEvent } from '@max/execution'


// ============================================================================
// Terminal progress renderer
// ============================================================================

export class SyncProgressRenderer {
  private counts = new Map<EntityType, { loaded: number; failed: number }>()
  private totalCompleted = 0
  private totalFailed = 0
  private startedAt = Date.now()
  private lastLineCount = 0

  constructor(private prompter: Prompter) {}

  onEvent(event: SyncProgressEvent): void {
    switch (event.kind) {
      case 'sync-started':
        this.prompter.write('Syncing...\n')
        break

      case 'task-completed': {
        const entry = this.counts.get(event.entityType) ?? { loaded: 0, failed: 0 }
        entry.loaded++
        this.counts.set(event.entityType, entry)
        this.totalCompleted++
        this.render()
        break
      }

      case 'task-failed': {
        const entry = this.counts.get(event.entityType) ?? { loaded: 0, failed: 0 }
        entry.failed++
        this.counts.set(event.entityType, entry)
        this.totalFailed++
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

  private render(): void {
    this.clearPreviousFrame()

    const lines: string[] = []

    // Entity type rows
    for (const [entityType, { loaded, failed }] of this.counts) {
      const name = String(entityType).padEnd(24)
      const failStr = failed > 0 ? `  (${failed} failed)` : ''
      lines.push(`  ${name} ${loaded} loaded${failStr}`)
    }

    // Summary line
    const elapsed = ((Date.now() - this.startedAt) / 1000).toFixed(1)
    lines.push(`  ${'─'.repeat(36)}`)
    lines.push(
      `  Tasks: ${this.totalCompleted} completed, ${this.totalFailed} failed  │  ${elapsed}s`
    )

    const output = lines.join('\n') + '\n'
    this.prompter.write(output)
    this.lastLineCount = lines.length
  }

  private clearPreviousFrame(): void {
    if (this.lastLineCount > 0) {
      // Move cursor up and clear each line
      this.prompter.write(`\x1b[${this.lastLineCount}A\x1b[0J`)
    }
  }
}
