package terminal

import (
	"bytes"
	"encoding/json"
	"io"
	"os"
	"path/filepath"
	"strings"
)

// modelWindows maps a Claude model to its native context window — the transcript
// records the model but not the window, so this is what the percent is taken
// against. Current Opus/Sonnet/Fable are natively 1M (no beta); Haiku and pre-4.6
// models are 200k. Matched by substring so a dated id ("…-4-5-20251001") still
// hits. ponytail: this table goes stale as models ship — the Models API's
// `max_input_tokens` is the authoritative upgrade path; an unlisted model falls
// back to inferring the window from the token count (contextWindowFor).
var modelWindows = []struct {
	match  string
	tokens int
}{
	{"opus-4-6", 1_000_000},
	{"opus-4-7", 1_000_000},
	{"opus-4-8", 1_000_000},
	{"sonnet-4-6", 1_000_000},
	{"sonnet-5", 1_000_000},
	{"fable-5", 1_000_000},
	{"mythos-5", 1_000_000},
	{"haiku-4-5", 200_000},
	// Older models (opus-4-5, sonnet-4-5, haiku-3-5, …) are unlisted and take
	// the 200k fallback below — their native window.
}

// contextWindows are the standard sizes the fallback picks between when a model
// is unlisted, smallest first.
var contextWindows = []int{200_000, 1_000_000}

// contextWindowFor returns the window for a token count when the model is
// unknown: the smallest standard window it still fits inside, the largest once
// it exceeds them all — exact the moment a session passes 200k (a 200k window
// cannot hold more than that).
func contextWindowFor(tokens int) int {
	for _, w := range contextWindows {
		if tokens <= w {
			return w
		}
	}
	return contextWindows[len(contextWindows)-1]
}

// windowForModel returns a model's native context window from modelWindows, or
// falls back to inferring it from the token count for an unlisted model.
func windowForModel(model string, tokens int) int {
	for _, w := range modelWindows {
		if strings.Contains(model, w.match) {
			return w.tokens
		}
	}
	return contextWindowFor(tokens)
}

// usageTailBytes bounds how much of a transcript's end is scanned for the last
// assistant message. One JSONL line (a single message, tool results and all) can
// run to tens of KB, so this holds several — the read stays O(tail), not
// O(file), yet still reaches the last assistant line past a couple of large user
// turns. ponytail: a turn larger than this whole window makes the read miss and
// the readout keep its prior number — widen it then, nothing breaks.
const usageTailBytes = 512 * 1024

// contextUsage is one provider conversation's context-window occupancy.
type contextUsage struct {
	tokens  int
	percent int
	window  int
	model   string
}

// claudeContextUsage reads the context-window usage of a Claude conversation
// from its transcript. The transcript is ~/.claude/projects/<slug>/<id>.jsonl;
// the id is a globally-unique UUID, so a glob across every project slug finds it
// without reconstructing Claude's path-encoding of the slug. ok is false on any
// miss (not found, unreadable, no assistant usage in the tail) — each is a "keep
// the last value" for the caller, none worth logging once per turn.
func claudeContextUsage(providerSessionID string) (contextUsage, bool) {
	path, ok := claudeTranscriptPath(providerSessionID)
	if !ok {
		return contextUsage{}, false
	}
	tail, ok := readTail(path, usageTailBytes)
	if !ok {
		return contextUsage{}, false
	}
	return parseContextUsage(tail)
}

// claudeTranscriptPath locates a conversation's transcript by its UUID under the
// Claude config dir ($CLAUDE_CONFIG_DIR, else ~/.claude). The UUID is unique, so
// at most one file matches; false when none does yet.
func claudeTranscriptPath(providerSessionID string) (string, bool) {
	base := os.Getenv("CLAUDE_CONFIG_DIR")
	if base == "" {
		home, err := os.UserHomeDir()
		if err != nil {
			return "", false
		}
		base = filepath.Join(home, ".claude")
	}
	matches, err := filepath.Glob(filepath.Join(base, "projects", "*", providerSessionID+".jsonl"))
	if err != nil || len(matches) == 0 {
		return "", false
	}
	return matches[0], true
}

// readTail returns up to the last max bytes of a file. false when it can't be
// opened or stat'd — the transcript may not exist yet, or be mid-write.
func readTail(path string, max int64) ([]byte, bool) {
	f, err := os.Open(path)
	if err != nil {
		return nil, false
	}
	defer f.Close()
	info, err := f.Stat()
	if err != nil {
		return nil, false
	}
	start := int64(0)
	if info.Size() > max {
		start = info.Size() - max
	}
	buf := make([]byte, info.Size()-start)
	if _, err := f.ReadAt(buf, start); err != nil && err != io.EOF {
		return nil, false
	}
	return buf, true
}

// parseContextUsage pulls context-window occupancy from a transcript tail: the
// newest main-thread assistant line's token usage. The context side is input +
// cache-read + cache-creation (output is the reply, not context loaded); percent
// is that against the line's model window (see windowForModel), capped at 100. false when the tail holds
// no such line — a fresh conversation, or a tail of only user turns. Sidechain
// lines (a Task sub-agent's own conversation, written into the same transcript)
// are skipped: their context is the sub-agent's, not the window the user sees. A
// leading partial line (the tail was cut mid-line) fails to parse and is skipped
// like any malformed line.
func parseContextUsage(tail []byte) (contextUsage, bool) {
	lines := bytes.Split(tail, []byte("\n"))
	for i := len(lines) - 1; i >= 0; i-- {
		line := bytes.TrimSpace(lines[i])
		if len(line) == 0 {
			continue
		}
		var entry struct {
			Type        string `json:"type"`
			IsSidechain bool   `json:"isSidechain"`
			Message     struct {
				Model string `json:"model"`
				Usage *struct {
					Input       int `json:"input_tokens"`
					CacheRead   int `json:"cache_read_input_tokens"`
					CacheCreate int `json:"cache_creation_input_tokens"`
				} `json:"usage"`
			} `json:"message"`
		}
		if err := json.Unmarshal(line, &entry); err != nil {
			continue
		}
		if entry.Type != "assistant" || entry.IsSidechain || entry.Message.Usage == nil {
			continue
		}
		u := entry.Message.Usage
		tokens := u.Input + u.CacheRead + u.CacheCreate
		window := windowForModel(entry.Message.Model, tokens)
		percent := min(tokens*100/window, 100)
		return contextUsage{tokens: tokens, percent: percent, window: window, model: entry.Message.Model}, true
	}
	return contextUsage{}, false
}
