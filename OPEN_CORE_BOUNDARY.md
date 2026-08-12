# Public Repository Safety Boundary

This repository contains the public Author 1.2.x Web and desktop source code under AGPL-3.0.

## Public Scope

Files in this repository may include:

- Public Web and desktop source code, tests, and maintenance fixes.
- Documentation required to install, use, and self-host the public edition.
- Public build and release automation that does not contain credentials or private infrastructure details.

## Excluded Material

Never commit or package:

- Unpublished plans, roadmaps, drafts, internal discussions, or non-public product materials.
- Private deployment topology, operator instructions, monitoring details, rollback metadata, or production configuration.
- Credentials, API secrets, signing keys, access tokens, private environment files, or real service-account data.
- User records, writing content, analytics exports, support attachments, logs, crash reports, or database snapshots.
- Mobile or other non-public source code, design assets, build artifacts, or repository metadata.

## Deployment Safety

`NEXT_PUBLIC_BASE_PATH` controls only the URL subpath used by a self-hosted deployment. Deployment-specific domains, registration values, service endpoints, credentials, and operator configuration must remain outside this repository and be supplied by each deployment environment.

## License Note

Contributions and distributions remain subject to AGPL-3.0 and any applicable third-party licenses. This document is an engineering safety boundary, not legal advice.
