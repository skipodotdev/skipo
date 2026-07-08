// Package project opens project directories through the OS file picker. Project
// metadata (list, active, sessions) lives in the frontend; this service only
// turns a picked directory into a stable identity the frontend can group its
// terminal sessions under.
package project

import (
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"os/exec"
	"path/filepath"
	"strings"

	"github.com/wailsapp/wails/v3/pkg/application"
)

// Project identifies an opened project directory.
type Project struct {
	ID   string `json:"id"`
	Name string `json:"name"`
	Path string `json:"path"`
}

// Service opens project directories via the native file picker.
type Service struct{}

// New returns a ready-to-use project service.
func New() *Service {
	return &Service{}
}

// Open shows the native directory picker and returns the chosen project, or nil
// if the user cancels the dialog.
func (s *Service) Open() (*Project, error) {
	path, err := application.Get().Dialog.OpenFile().
		CanChooseDirectories(true).
		CanChooseFiles(false).
		SetTitle("Open Project").
		PromptForSingleSelection()
	if err != nil {
		return nil, fmt.Errorf("open dialog failed: %w", err)
	}
	if path == "" {
		return nil, nil // cancelled
	}
	return &Project{ID: projectID(path), Name: filepath.Base(path), Path: path}, nil
}

// Branch returns the current git branch of the project directory, or "" when the
// path is not a git work tree or HEAD is detached (no branch to name). It reads
// the current state on call, so a checkout made after opening is not reflected
// until the branch is resolved again.
func (s *Service) Branch(path string) string {
	out, err := exec.Command("git", "-C", path, "symbolic-ref", "--short", "HEAD").Output()
	if err != nil {
		return ""
	}
	return strings.TrimSpace(string(out))
}

// projectID derives a stable, URL- and event-safe ID from the absolute path, so
// the same directory always maps to the same project.
func projectID(path string) string {
	sum := sha256.Sum256([]byte(path))
	return hex.EncodeToString(sum[:6])
}
