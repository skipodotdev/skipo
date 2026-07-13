# Contract: session state

Reports a session's Claude Code processing state to lich so its card shows a
spinner while Claude is working and a check when the turn ends.

See [README.md](README.md) for the shared transport (`LICH_PORT` / `LICH_TOKEN`
/ `LICH_SESSION_ID`) and the client rules every hook follows.

## Request

```
POST http://127.0.0.1:${LICH_PORT}/hook?token=${LICH_TOKEN}
Content-Type: application/json

{"session_id": "<LICH_SESSION_ID>", "state": "<busy|done>"}
```

States: only `busy` and `done`. lich rejects anything else.

Responses: `204` ok · `401` invalid token · `400` invalid body.

## Event → state mapping

| Claude Code hook   | state  |
|--------------------|--------|
| `UserPromptSubmit` | `busy` |
| `Stop`             | `done` |

## lich server side

- **Env injection** — `internal/terminal/terminal.go`, `Service.sessionEnv`:
  adds the three `LICH_*` vars to each PTY's environment.
- **Endpoint** — `internal/terminal/transport.go`, `transport.hook`: validates
  the token and body (`parseHookRequest`) on the same loopback listener as
  terminal I/O, then forwards `(session_id, state)`.
- **UI push** — `internal/terminal/terminal.go`: emits the Wails event
  `session-status:<id>` with the state.
- **Render** — `frontend/src/components/sidebar/SessionCard.tsx`: subscribes to
  that event and shows a spinner (`busy`) or check (`done`).

## Known ceilings

- `UserPromptSubmit` → busy, `Stop` → done. An interrupt (Esc) that skips `Stop`
  can leave a spinner until the next turn resets it.
- Status is not retained by lich: a card that unmounts and remounts (switching
  projects mid-run) misses the event and can strand a spinner. Fix path: keep
  the last state per session in Go and hand it to the card on mount.
- States limited to `busy`/`done`. Adding another (e.g. `waiting` from
  `Notification`) is a contract change — see the versioning note in the README.
