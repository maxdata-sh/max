import * as fs from 'fs';
import * as path from 'path';
import YAML from 'yaml';
import { minimatch } from 'minimatch';
import type { ConfigManager } from './config-manager.js';
import type { SourcePermission } from '../types/connector.js';
import type {
  NormalizedPermission,
  Rule,
  RuleMatch,
  QueryContext,
  AccessResult,
  PermissionsSummary,
} from '../types/permissions.js';
import type { StoredEntity } from '../types/entity.js';

interface RulesFile {
  rules: RuleDefinition[];
}

interface RuleDefinition {
  name: string;
  deny?: RuleMatch;
  allow?: RuleMatch;
}

export class PermissionsEngine {
  private rules: Rule[] = [];

  /**
   * Normalize source permissions to Data Pipe format
   */
  normalize(source: string, permissions: SourcePermission[]): NormalizedPermission[] {
    return permissions.map(perm => {
      // Map source-specific roles to normalized access levels
      let access: 'owner' | 'write' | 'read';
      switch (perm.role) {
        case 'owner':
          access = 'owner';
          break;
        case 'writer':
          access = 'write';
          break;
        case 'reader':
        default:
          access = 'read';
          break;
      }

      // Map source-specific principal types to normalized types
      let principalType: 'user' | 'group' | 'domain' | 'public';
      switch (perm.type) {
        case 'user':
          principalType = 'user';
          break;
        case 'group':
          principalType = 'group';
          break;
        case 'domain':
          principalType = 'domain';
          break;
        case 'anyone':
          principalType = 'public';
          break;
        default:
          principalType = 'user';
      }

      return {
        principal: {
          type: principalType,
          identifier: perm.email || perm.domain,
        },
        access,
      };
    });
  }

  /**
   * Load rules from a YAML file
   */
  async loadRules(rulesPath: string): Promise<void> {
    if (!fs.existsSync(rulesPath)) {
      throw new Error(`Rules file not found: ${rulesPath}`);
    }

    const content = fs.readFileSync(rulesPath, 'utf-8');
    const parsed = YAML.parse(content) as RulesFile;

    if (!parsed.rules || !Array.isArray(parsed.rules)) {
      throw new Error('Invalid rules file: missing "rules" array');
    }

    for (const ruleDef of parsed.rules) {
      if (!ruleDef.name) {
        throw new Error('Invalid rule: missing "name"');
      }

      if (ruleDef.deny) {
        this.rules.push({
          name: ruleDef.name,
          type: 'deny',
          match: ruleDef.deny,
        });
      } else if (ruleDef.allow) {
        this.rules.push({
          name: ruleDef.name,
          type: 'allow',
          match: ruleDef.allow,
        });
      } else {
        throw new Error(`Invalid rule "${ruleDef.name}": must have either "deny" or "allow"`);
      }
    }
  }

  /**
   * Load all rules from the config's rules directory
   */
  async loadRulesFromConfig(config: ConfigManager): Promise<void> {
    const rulesDir = config.getRulesDir();

    if (!fs.existsSync(rulesDir)) {
      return;
    }

    const files = fs.readdirSync(rulesDir).filter(f => f.endsWith('.yaml') || f.endsWith('.yml'));

    for (const file of files) {
      await this.loadRules(path.join(rulesDir, file));
    }
  }

  /**
   * Get all loaded rules
   */
  getRules(): Rule[] {
    return [...this.rules];
  }

  /**
   * Clear all rules
   */
  clearRules(): void {
    this.rules = [];
  }

  /**
   * Filter entities based on rules
   */
  filter(entities: StoredEntity[], context: QueryContext): StoredEntity[] {
    return entities.filter(entity => this.isAccessible(entity, context).accessible);
  }

  /**
   * Check if a single entity is accessible
   */
  isAccessible(entity: StoredEntity, context: QueryContext): AccessResult {
    // Process rules in order
    // Deny rules take precedence unless an allow rule explicitly permits
    for (const rule of this.rules) {
      if (this.matchesRule(entity, rule.match)) {
        if (rule.type === 'deny') {
          return {
            accessible: false,
            reason: `denied by rule: ${rule.name}`,
          };
        }
      }
    }

    return { accessible: true };
  }

  /**
   * Get permissions summary for an entity
   */
  describe(entity: StoredEntity): PermissionsSummary {
    const appliedRules: { rule: string; effect: 'deny' | 'allow' }[] = [];

    for (const rule of this.rules) {
      if (this.matchesRule(entity, rule.match)) {
        appliedRules.push({
          rule: rule.name,
          effect: rule.type,
        });
      }
    }

    const accessResult = this.isAccessible(entity, {});

    return {
      source: {
        type: entity.source,
        permissions: [], // Will be filled in by caller
      },
      normalized: entity.permissions,
      appliedRules,
      effectiveAccess: accessResult.accessible,
    };
  }

  /**
   * Check if an entity matches a rule's match criteria
   */
  private matchesRule(entity: StoredEntity, match: RuleMatch): boolean {
    // Check path pattern
    if (match.path) {
      const entityPath = entity.properties.path as string | undefined;
      if (!entityPath) return false;
      if (!minimatch(entityPath, match.path)) return false;
    }

    // Check owner pattern
    if (match.owner) {
      const entityOwner = entity.properties.owner as string | undefined;
      if (!entityOwner) return false;
      if (match.owner.includes('*')) {
        if (!minimatch(entityOwner, match.owner)) return false;
      } else {
        if (entityOwner !== match.owner) return false;
      }
    }

    // Check entity type
    if (match.type) {
      if (entity.type !== match.type) return false;
    }

    return true;
  }
}
