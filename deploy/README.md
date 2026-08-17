# Self-hosted STRK20 discovery

Public Consumer + Paid Resource hosting is on Render. See [render.md](render.md).

VERIFIED (`vendor/starknet-privacy/deploy/discovery-service/Dockerfile`): This repository pins the discovery service source through the `vendor/starknet-privacy` submodule.

Create local configuration:

```sh
cp .env.discovery.example .env.discovery
openssl rand -hex 32
```

Put the generated value in `STRK20_OHTTP_KEY`. Do not commit `.env.discovery`.

Start the service:

```sh
docker compose --env-file .env.discovery -f deploy/discovery-compose.yml up --build -d
curl -sS http://127.0.0.1:8080/health
curl -sS http://127.0.0.1:8080/ohttp-keys
```

These curl commands assume `STRK20_DISCOVERY_PORT=8080`, as shown in the example file.

VERIFIED (`vendor/starknet-privacy/crates/discovery-service/specs/18-configuration.md`): The service reads blocks through `RPC_URL` and subscribes to new blocks through `WS_URL`.

VERIFIED (`vendor/starknet-privacy/crates/discovery-service/specs/20-ohttp-integration.md`): The paid server requires OHTTP. Discovery startup fails when OHTTP is enabled without a valid 32-byte X25519 key.

VERIFIED (Alchemy Starknet network page, checked 2026-08-14): Alchemy lists these Mainnet endpoint forms:

- `https://starknet-mainnet.g.alchemy.com/v2/<api-key>`
- `wss://starknet-mainnet.g.alchemy.com/v2/<api-key>`

Source: https://www.alchemy.com/rpc/starknet

The Compose file exposes discovery only on `127.0.0.1`. Put an HTTPS reverse proxy in front of it. Then set `STRK20_INDEXER_URL` in `.env.server` to that HTTPS origin.

VERIFIED (`src/private402/server-runtime.ts`): The paid server sends discovery calls with OHTTP enabled. The discovery operator can decrypt the request content. Direct OHTTP does not hide the paid server IP from the discovery operator.

## Production checks

1. Keep the HTTP and WebSocket endpoints on the same Starknet network.
2. Store `STRK20_OHTTP_KEY` in the deployment secret store.
3. Restrict port `8080` to the local host or private network.
4. Terminate HTTPS before public traffic reaches discovery.
5. Alert when `/health` is not `OK` or indexer lag increases.
