# TODO

## Post-PoC Polish

### 1. Update README for release
- [ ] Replace development commands with release commands (e.g. `max connect gdrive` instead of `npx tsx src/cli/index.ts connect gdrive`)
- [ ] Replace npm references with bun
- [ ] Document installation via `bun install -g` or similar
- [ ] Remove development-specific sections

### 2. Streamline Google Drive setup
- [ ] Create interactive CLI wizard for OAuth setup (`max connect gdrive` walks user through steps)
- [ ] Consider options:
  - Open Google Cloud Console directly from CLI
  - Provide copy-paste instructions inline
  - Auto-detect if credentials are missing and guide user
  - Potentially bundle a "demo" OAuth app for quick testing (with appropriate scopes/warnings)
- [ ] Add `max connect gdrive --status` to check connection health

### 3. Secure credential storage (no env vars)
- [ ] Store OAuth client ID/secret in `.max/credentials/gdrive-oauth.json` instead of environment variables
- [ ] Prompt for client ID/secret on first `max connect gdrive` if not present
- [ ] Consider options:
  - Interactive prompt → store in `.max/credentials/` (simple, project-scoped)
  - System keychain integration (macOS Keychain, Linux secret-service) for extra security
  - Encrypted file with user-provided passphrase
- [ ] Ensure `.max/credentials/` is in `.gitignore` (already done)
- [ ] Credentials only loaded by connector, not exposed as env vars
