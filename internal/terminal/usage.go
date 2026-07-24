package terminal

import "log/slog"

// usageEventName carries a session's context-window usage ({id, percent, tokens}),
// emitted after a turn ends. Global like the other session events: the card that
// shows it is only mounted while its project is active, so a per-session name
// could not reach it.
const usageEventName = "session-usage"

// usageEvent is the payload of usageEventName. Percent is the share of the
// context window the turn left occupied (0–100); Tokens is the raw input-side
// count behind it, Window the model's context window, and Model the model id —
// all for the tooltip.
type usageEvent struct {
	ID      string `json:"id"`
	Percent int    `json:"percent"`
	Tokens  int    `json:"tokens"`
	Window  int    `json:"window"`
	Model   string `json:"model"`
}

// emitUsage reads the context-window usage of the provider conversation running
// in session id and pushes it to the frontend. Called off the status hook's
// turn-boundary states (see New), where the transcript's final usage is written.
// Silent on any miss — no provider id yet, no transcript, an unreadable or
// half-written file — so a card keeps its last number instead of flickering.
//
// Only Claude reports a provider session id today (resume and the session-start
// hook are Claude-only), so the reader is Claude's. A second provider that grows
// one selects its own reader here by the session's kind — not an interface until
// there are two to hide behind it.
func (s *Service) emitUsage(id string) {
	providerSessionID, err := s.store.ProviderSession(id)
	if err != nil {
		slog.Warn("terminal: read provider session", "session", id, "err", err)
		return
	}
	if providerSessionID == "" {
		return
	}
	u, ok := claudeContextUsage(providerSessionID)
	if !ok {
		return
	}
	s.hub.Emit(usageEventName, usageEvent{ID: id, Percent: u.percent, Tokens: u.tokens, Window: u.window, Model: u.model})
}
