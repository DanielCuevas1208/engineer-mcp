# Security policy

Engineer MCP stores no credentials and no user data.
The server reads only its own data files.

## Supported versions

Maintain fixes on the current release only.
Apply security fixes to the latest minor version.

## Reporting a vulnerability

Do not open a public issue for a security problem.
Send the details to the repository owner through a private channel.
Include the steps to reproduce the problem.
Include the impact of the problem.
Include any proposed fix.

You will receive an acknowledgement within seven days.
We will work with you to confirm the problem.
We will release a fix for confirmed problems.
We will credit you in the release notes if you want credit.

## Scope

The following are in scope:

- Server code in `src/`.
- The command line entry point.
- The MCP tool inputs and outputs.
- The packaged dependencies.

The following are out of scope:

- Typo-level issues with no security impact.
- Issues that need physical access to the host.
- Issues that rely on a compromised dependency channel.
