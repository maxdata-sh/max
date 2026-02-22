FIXME: I think we need to move the config types out of here into BunPlatform instead. InstallationSpec and WorkspaceSpec are platform-agnostic, but these are not:
- connector-registry
- credential-store
- engine
- installation-registry

It's up for question because these types are _likely_ to be highly shared across platforms - but maybe they ought to live in a platform-common rather than in federation.
