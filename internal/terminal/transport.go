package terminal

import (
	"context"
	"crypto/rand"
	"crypto/subtle"
	"encoding/hex"
	"errors"
	"fmt"
	"net"
	"net/http"
	"sync"
	"time"

	"github.com/coder/websocket"
)

// The Wails event bridge costs one engine round-trip per crossing: every
// Service.Write is an HTTP fetch through the WebKit network process, and every
// data event is an evaluate_javascript call with a base64 payload. During
// interactive typing that adds up to ~60 crossings/s of native dispatch
// overhead that saturates the webview main thread (measured 2026-07-10:
// ~40ms stall trains while typing, all JS callbacks innocent). This transport
// replaces both directions for terminal I/O with one local WebSocket carrying
// binary frames; everything else stays on the Wails bridge. When no client is
// connected (or a write fails) senders fall back to the event bridge, so the
// app works unchanged without it.
//
// Frame format, both directions: [1 byte id length][session id][payload].

const (
	// wsWriteTimeout bounds a send to the local client; a stalled write drops
	// the connection so output falls back to the event bridge.
	wsWriteTimeout = 5 * time.Second
	// wsReadLimit bounds one input frame; keystrokes and pastes are far
	// smaller, and the frontend chunks nothing above this.
	wsReadLimit = 1 << 20
	// tokenBytes is the size of the random connect token.
	tokenBytes = 16
)

// encodeFrame prefixes payload with the session id. The id must fit one byte
// of length.
func encodeFrame(id string, payload []byte) ([]byte, error) {
	if len(id) == 0 || len(id) > 255 {
		return nil, fmt.Errorf("session id length %d out of range", len(id))
	}
	buf := make([]byte, 1+len(id)+len(payload))
	buf[0] = byte(len(id))
	copy(buf[1:], id)
	copy(buf[1+len(id):], payload)
	return buf, nil
}

// decodeFrame splits a frame into session id and payload. The payload aliases
// buf; callers must not retain it past the next read.
func decodeFrame(buf []byte) (string, []byte, error) {
	if len(buf) < 1 {
		return "", nil, errors.New("empty frame")
	}
	n := int(buf[0])
	if n == 0 || len(buf) < 1+n {
		return "", nil, fmt.Errorf("frame id length %d exceeds frame size %d", n, len(buf))
	}
	return string(buf[1 : 1+n]), buf[1+n:], nil
}

// transport is the local WebSocket endpoint. One client (the webview) is
// expected; a new connection replaces the previous one.
type transport struct {
	mu    sync.Mutex
	conn  *websocket.Conn
	port  int
	token string
	input func(id string, data []byte)
}

// newTransport starts the listener on a random loopback port. input receives
// decoded input frames (keyboard data for a session's PTY).
func newTransport(input func(id string, data []byte)) (*transport, error) {
	raw := make([]byte, tokenBytes)
	if _, err := rand.Read(raw); err != nil {
		return nil, fmt.Errorf("failed to generate transport token: %w", err)
	}
	listener, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		return nil, fmt.Errorf("failed to listen for transport: %w", err)
	}
	t := &transport{
		port:  listener.Addr().(*net.TCPAddr).Port,
		token: hex.EncodeToString(raw),
		input: input,
	}
	mux := http.NewServeMux()
	mux.HandleFunc("/ws", t.handle)
	// ponytail: server and listener live for the process lifetime, like the
	// PTY sessions they serve; add Shutdown if the app ever needs teardown.
	go func() { _ = http.Serve(listener, mux) }()
	return t, nil
}

// handle upgrades the single expected client. The webview's origin is the
// wails scheme (or the Vite dev server), never this listener's host, so the
// origin check is skipped — the random token is the auth.
func (t *transport) handle(w http.ResponseWriter, r *http.Request) {
	provided := r.URL.Query().Get("token")
	if subtle.ConstantTimeCompare([]byte(provided), []byte(t.token)) != 1 {
		http.Error(w, "invalid token", http.StatusUnauthorized)
		return
	}
	conn, err := websocket.Accept(w, r, &websocket.AcceptOptions{InsecureSkipVerify: true})
	if err != nil {
		return
	}
	conn.SetReadLimit(wsReadLimit)

	t.mu.Lock()
	previous := t.conn
	t.conn = conn
	t.mu.Unlock()
	if previous != nil {
		_ = previous.Close(websocket.StatusPolicyViolation, "replaced by new client")
	}
	go t.readLoop(conn)
}

// readLoop forwards input frames to the service until the connection dies.
func (t *transport) readLoop(conn *websocket.Conn) {
	ctx := context.Background()
	for {
		kind, data, err := conn.Read(ctx)
		if err != nil {
			t.drop(conn)
			return
		}
		if kind != websocket.MessageBinary {
			continue
		}
		id, payload, err := decodeFrame(data)
		if err != nil {
			continue
		}
		t.input(id, payload)
	}
}

// drop forgets conn if it is still the active client.
func (t *transport) drop(conn *websocket.Conn) {
	t.mu.Lock()
	if t.conn == conn {
		t.conn = nil
	}
	t.mu.Unlock()
	_ = conn.Close(websocket.StatusNormalClosure, "")
}

// send delivers one session's output frame to the connected client. It
// returns false — and drops the client on write failure — when the caller
// should fall back to the event bridge.
// ponytail: one mutex serializes writes for every session; per-session queues
// only if a local loopback write ever measurably stalls.
func (t *transport) send(id string, data []byte) bool {
	t.mu.Lock()
	defer t.mu.Unlock()
	if t.conn == nil {
		return false
	}
	frame, err := encodeFrame(id, data)
	if err != nil {
		return false
	}
	ctx, cancel := context.WithTimeout(context.Background(), wsWriteTimeout)
	defer cancel()
	if err := t.conn.Write(ctx, websocket.MessageBinary, frame); err != nil {
		t.conn = nil
		return false
	}
	return true
}

// TransportInfo tells the frontend where the terminal I/O WebSocket lives. A
// zero Port means the transport failed to start and the event bridge is the
// only path.
type TransportInfo struct {
	Port  int    `json:"port"`
	Token string `json:"token"`
}

// Transport returns the WebSocket endpoint for terminal I/O.
func (s *Service) Transport() TransportInfo {
	if s.ws == nil {
		return TransportInfo{}
	}
	return TransportInfo{Port: s.ws.port, Token: s.ws.token}
}
