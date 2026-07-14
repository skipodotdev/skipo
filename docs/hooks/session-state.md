# Contract: session state

Reports a session's Claude Code processing state to lich so its card shows a
spinner while Claude is working, a check when the turn ends, and a bell when
Claude is blocked on the user — plus a toast that routes to the waiting card.

See [README.md](README.md) for the shared transport (`LICH_PORT` / `LICH_TOKEN`
/ `LICH_SESSION_ID`) and the client rules every hook follows.

## Request

```
POST http://127.0.0.1:${LICH_PORT}/hook?token=${LICH_TOKEN}
Content-Type: application/json

{"session_id": "<LICH_SESSION_ID>", "state": "<busy|done>"}
```

States: `busy`, `done`, `waiting`. lich rejects anything else.

Responses: `204` ok · `401` invalid token · `400` invalid body.

## Event → state mapping

| Claude Code hook   | state     |
|--------------------|-----------|
| `UserPromptSubmit` | `busy`    |
| `Stop`             | `done`    |
| `Notification`     | `waiting` |

`Notification` fires when Claude needs a permission decision or has been idle
waiting for input — both mean "your turn". A later `UserPromptSubmit` (busy) or
`Stop` (done) clears it. lich shows a toast (see below) only for `waiting`.

## lich server side

- **Env injection** — `internal/terminal/terminal.go`, `Service.sessionEnv`:
  adds the three `LICH_*` vars to each PTY's environment.
- **Endpoint** — `internal/terminal/transport.go`, `transport.hook`: validates
  the token and body (`parseHookRequest`) on the same loopback listener as
  terminal I/O, then forwards `(session_id, state)`.
- **UI push** — `internal/terminal/terminal.go`: emits the Wails event
  `session-status:<id>` with the state, and for `waiting` also the global
  `session-attention` event (`{id}`).
- **Render** — `frontend/src/components/sidebar/SessionCard.tsx`: subscribes to
  the per-session event and shows a spinner (`busy`), check (`done`) or bell
  (`waiting`).
- **Toast + route** — `frontend/src/lib/projects.tsx`: subscribes to the global
  `session-attention` event and raises an actionable toast that navigates to the
  session's card. It is global so a session in a background project (whose card
  is not mounted) still surfaces; it is skipped for the session already focused.

## Known ceilings

- `UserPromptSubmit` → busy, `Stop` → done. An interrupt (Esc) that skips `Stop`
  can leave a spinner until the next turn resets it.
- Status is not retained by lich: a card that unmounts and remounts (switching
  projects mid-run) misses the event and can strand a spinner — and, after the
  toast routes you to a background session, its freshly mounted card shows no
  bell because the `waiting` event already fired. Fix path: keep the last state
  per session in Go and hand it to the card on mount.
- The attention toast auto-dismisses on a timer (`ATTENTION_TOAST_MS`); it does
  not clear when the session leaves `waiting` (user handled it in the terminal).
  Fix path: track the toast id per session and dismiss it on the next
  busy/done.
- Adding another state beyond `busy`/`done`/`waiting` is a contract change — see
  the versioning note in the README.
