import type { SourcePermission } from './connector.js';

export interface NormalizedPermission {
  principal: Principal;
  access: 'owner' | 'write' | 'read';
}

export interface Principal {
  type: 'user' | 'group' | 'domain' | 'public';
  identifier?: string;
}

export interface Rule {
  name: string;
  type: 'deny' | 'allow';
  match: RuleMatch;
}

export interface RuleMatch {
  path?: string;
  owner?: string;
  type?: string;
}

export interface QueryContext {
  identity?: string;
  mode?: 'normal' | 'explorer';
}

export interface AccessResult {
  accessible: boolean;
  reason?: string;
}

export interface PermissionsSummary {
  source: {
    type: string;
    permissions: SourcePermission[];
  };
  normalized: NormalizedPermission[];
  appliedRules: {
    rule: string;
    effect: 'deny' | 'allow';
  }[];
  effectiveAccess: boolean;
}
