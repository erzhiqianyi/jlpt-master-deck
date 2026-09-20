# Pinned MCP App server

`ninomae-mcp-app-server-0.2.0.tgz` is built from the MIT-licensed
https://github.com/erzhiqianyi/mcp-app-server commit
`7e248ea74403e03e4ad7575e222601dd254ca9d1` (version 0.2.0).

The published npm registry version was still 0.1.0 when this archive was added.
Keeping the built package here removes the dependency on a sibling checkout in
local builds and GitHub Actions. The archive includes its license and source maps.

To reproduce from that commit: `npm ci`, then `npm pack`.
When 0.2.0 is available from npm, replace the file dependency with that exact
registry version and regenerate package-lock.json.
