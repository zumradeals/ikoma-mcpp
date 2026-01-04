# CHANGELOG

## [2.1.0] - 2024-01-04

### Added
- **V1 Primitives for IKOMA Deployer**:
  - `repo.clone`: Clones a GitHub repository into the application source directory.
  - `supabase.ensure`: Ensures the Supabase self-hosted stack is running for the application.
  - `supabase.apply`: Applies database migrations and deploys edge functions.
  - `release.deploy`: Deploys the application, manages symlinks, and verifies environment variables.

### Security
- Enforced RBAC (minimum `builder` role for all V1 tools).
- Path confinement under `/srv/apps/<app_slug>/`.
- S1 Secrets mode: environment variables are checked for presence but never returned in responses.
- Audit logging for all V1 tool executions.
