package project

import (
	"os/exec"
	"testing"
)

// TestBranch proves Branch reads the checked-out branch of a git work tree and
// returns "" for a directory that is not a repository.
func TestBranch(t *testing.T) {
	repo := t.TempDir()
	if out, err := exec.Command("git", "init", "-b", "trunk", repo).CombinedOutput(); err != nil {
		t.Skipf("git init unavailable: %v (%s)", err, out)
	}

	svc := New()
	if got := svc.Branch(repo); got != "trunk" {
		t.Errorf("Branch(repo) = %q, want trunk", got)
	}
	if got := svc.Branch(t.TempDir()); got != "" {
		t.Errorf("Branch(non-repo) = %q, want empty", got)
	}
}
