export type ConnectorRegistryConfig =
  { type: 'hardcoded', moduleMap?: Record<string,string> }


// FIXME: We need to create a connector registry that loads from max.json
export type ResolvedConnectorRegistryConfig =
  | { type: 'hardcoded', moduleMap: Record<string,string> }

