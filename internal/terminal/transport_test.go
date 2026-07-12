package terminal

import (
	"bytes"
	"context"
	"fmt"
	"testing"
	"time"

	"github.com/coder/websocket"
)

func TestFrameRoundTrip(t *testing.T) {
	frame, err := encodeFrame("sess-1", []byte("hello"))
	if err != nil {
		t.Fatalf("encodeFrame: %v", err)
	}
	id, payload, err := decodeFrame(frame)
	if err != nil {
		t.Fatalf("decodeFrame: %v", err)
	}
	if id != "sess-1" || !bytes.Equal(payload, []byte("hello")) {
		t.Fatalf("got id=%q payload=%q", id, payload)
	}
}

func TestFrameEmptyPayload(t *testing.T) {
	frame, err := encodeFrame("s", nil)
	if err != nil {
		t.Fatalf("encodeFrame: %v", err)
	}
	id, payload, err := decodeFrame(frame)
	if err != nil {
		t.Fatalf("decodeFrame: %v", err)
	}
	if id != "s" || len(payload) != 0 {
		t.Fatalf("got id=%q payload=%q", id, payload)
	}
}

func TestFrameErrors(t *testing.T) {
	if _, err := encodeFrame("", []byte("x")); err == nil {
		t.Fatal("expected error for empty id")
	}
	long := make([]byte, 256)
	if _, err := encodeFrame(string(long), nil); err == nil {
		t.Fatal("expected error for oversized id")
	}
	if _, _, err := decodeFrame(nil); err == nil {
		t.Fatal("expected error for empty frame")
	}
	if _, _, err := decodeFrame([]byte{10, 'a'}); err == nil {
		t.Fatal("expected error for truncated frame")
	}
	if _, _, err := decodeFrame([]byte{0, 'a'}); err == nil {
		t.Fatal("expected error for zero id length")
	}
}

// dial connects a test client to the transport with the given token.
func dial(t *testing.T, tr *transport, token string) (*websocket.Conn, error) {
	t.Helper()
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	conn, resp, err := websocket.Dial(ctx, fmt.Sprintf("ws://127.0.0.1:%d/ws?token=%s", tr.port, token), nil)
	if resp != nil && resp.Body != nil {
		defer func() { _ = resp.Body.Close() }()
	}
	return conn, err
}

func TestTransportRejectsBadToken(t *testing.T) {
	tr, err := newTransport(func(string, []byte) {})
	if err != nil {
		t.Fatalf("newTransport: %v", err)
	}
	if _, err := dial(t, tr, "wrong"); err == nil {
		t.Fatal("expected dial to fail with a bad token")
	}
}

func TestTransportInputReachesService(t *testing.T) {
	got := make(chan string, 1)
	tr, err := newTransport(func(id string, data []byte) {
		got <- id + ":" + string(data)
	})
	if err != nil {
		t.Fatalf("newTransport: %v", err)
	}
	conn, err := dial(t, tr, tr.token)
	if err != nil {
		t.Fatalf("dial: %v", err)
	}
	defer func() { _ = conn.Close(websocket.StatusNormalClosure, "") }()

	frame, err := encodeFrame("sess", []byte("ls\r"))
	if err != nil {
		t.Fatalf("encodeFrame: %v", err)
	}
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	if err := conn.Write(ctx, websocket.MessageBinary, frame); err != nil {
		t.Fatalf("write: %v", err)
	}
	select {
	case v := <-got:
		if v != "sess:ls\r" {
			t.Fatalf("got %q", v)
		}
	case <-time.After(5 * time.Second):
		t.Fatal("input frame never reached the service")
	}
}

func TestTransportSendAndFallback(t *testing.T) {
	tr, err := newTransport(func(string, []byte) {})
	if err != nil {
		t.Fatalf("newTransport: %v", err)
	}
	if tr.send("sess", []byte("x")) {
		t.Fatal("send must report false with no client connected")
	}

	conn, err := dial(t, tr, tr.token)
	if err != nil {
		t.Fatalf("dial: %v", err)
	}
	defer func() { _ = conn.Close(websocket.StatusNormalClosure, "") }()
	// The server registers the client during the handshake, so send is ready
	// as soon as Dial returns.
	if !tr.send("sess", []byte("output")) {
		t.Fatal("send must succeed with a connected client")
	}

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	kind, data, err := conn.Read(ctx)
	if err != nil {
		t.Fatalf("read: %v", err)
	}
	if kind != websocket.MessageBinary {
		t.Fatalf("got message type %v", kind)
	}
	id, payload, err := decodeFrame(data)
	if err != nil {
		t.Fatalf("decodeFrame: %v", err)
	}
	if id != "sess" || string(payload) != "output" {
		t.Fatalf("got id=%q payload=%q", id, payload)
	}
}

func TestTransportInfoZeroWithoutTransport(t *testing.T) {
	s := &Service{}
	if info := s.Transport(); info.Port != 0 || info.Token != "" {
		t.Fatalf("expected zero TransportInfo, got %+v", info)
	}
}
