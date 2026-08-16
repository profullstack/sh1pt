# netcup (VPS, Root Server)

Provides the netcup cloud provider adapter for sh1pt `deploy` and `scale`
workflows, driving the Server Control Panel (SCP) REST API.

## Read this first: netcup has no order API

Every other cloud adapter in sh1pt can call an endpoint and get a new machine.
**netcup cannot.** Servers are bought through checkout in the Customer Control
Panel — they are monthly contracts, not API resources. The SCP API only ever
sees servers that already exist on the account.

This is not an oversight in the adapter. The retired SOAP webservice had no
order method, and the REST API that replaced it on 2026-04-30 has 63 endpoints,
none of which create or delete a server.

So the two lifecycle verbs mean something specific here:

| sh1pt verb | netcup behaviour |
|---|---|
| `provision` | **Adopts** a server already on the account that has no OS installed, then installs one on it (`POST /servers/{id}/image`) |
| `destroy` | **Throws.** There is no cancel endpoint; a server is terminated from the Customer Control Panel. Powering it off would leave the contract billing while reporting success |

If nothing is adoptable, `provision` fails with the plan that matches your spec
and a link to buy it, then adopts it on the next run.

### Why provision is still worth having

`POST /servers/{id}/image` accepts `hostname`, `sshKeyIds` and a `customScript`
that runs on first boot. So one adopt call can land a fully configured box —
image installed, key authorized, bootstrap script executed — which is the
expensive part of standing up a server anyway.

```ts
provision(ctx, { kind: 'cpu-vps', sshKeyIds: ['5'], tags: ['dev.moshcode.sh'] }, {
  defaultImage: 'Ubuntu 24.04',
  customScript: '#!/bin/bash\ncurl -fsSL https://example.com/root-ubuntu.sh | bash',
});
```

### Guardrails

Installing an image **wipes the target disk**, so adoption is deliberately
timid:

- A server with a `template` already has an OS and is never adopted.
- A `disabled` server is never adopted.
- If more than one server is adoptable and no `adoptPrefix` is configured,
  `provision` refuses rather than guessing.

## Credentials

Two grants are supported, checked in this order:

1. `NETCUP_SCP_CLIENT_ID` + `NETCUP_SCP_CLIENT_SECRET` — client credentials,
   created in SCP under **Options → REST API**. Preferred.
2. `NETCUP_SCP_USERNAME` + `NETCUP_SCP_PASSWORD` — password grant. The username
   is your CCP customer number.

`NETCUP_SCP_USER_ID` is optional and only needed to resolve SSH keys by name
rather than by numeric id. Note that the SCP `userId` is **not** the CCP
customer number — it is a separate internal identifier.

```bash
sh1pt secret set NETCUP_SCP_CLIENT_ID <client id>
sh1pt secret set NETCUP_SCP_CLIENT_SECRET <client secret>
```

SCP supports an IP allowlist for API access (Options → REST API). A `403` with
`ip not allowed` means the calling host is not on it.

## Pricing

netcup publishes no pricing endpoint, so `quote` reads from the price list
compiled into the adapter (EUR, incl. 19% VAT, verified 2026-08-16). netcup
bills monthly contracts; the `hourly` field is derived as `monthly / 730` purely
to satisfy sh1pt's `Quote` shape and does not correspond to anything netcup
charges. **Update `PRICES` in `src/index.ts` when the price list moves.**

## Package

- Name: `@profullstack/sh1pt-cloud-netcup`
- Path: `packages/cloud/netcup`
- Adapter ID: `cloud-netcup`
- Homepage: https://sh1pt.com

## API reference

- Docs: https://www.netcup.com/en/helpcenter/documentation/server/rest-api
- OpenAPI: https://www.servercontrolpanel.de/scp-core/api/v1/openapi
- Base URL: `https://www.servercontrolpanel.de/scp-core/api/v1`

## Development

```bash
pnpm --filter @profullstack/sh1pt-cloud-netcup typecheck
pnpm vitest run packages/cloud/netcup/src/index.test.ts
```
