package project

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"
)

// DiscardFile reverts one file's uncommitted changes. A file known to HEAD is
// checked out from it (restoring index and worktree in one step); a new file
// (staged or untracked) is unstaged and deleted from disk. rel must be a
// repo-relative path — the review panel passes paths parsed from git's own
// diff output.
func (s *Service) DiscardFile(path, rel string) error {
	if err := validateRelPath(rel); err != nil {
		return err
	}
	if _, err := runGit(path, "cat-file", "-e", "HEAD:"+rel); err == nil {
		_, err := runGit(path, "checkout", "HEAD", "--", rel)
		return err
	}
	if _, err := runGit(path, "rm", "-f", "--cached", "--ignore-unmatch", "--", rel); err != nil {
		return err
	}
	if err := os.Remove(filepath.Join(path, rel)); err != nil && !os.IsNotExist(err) {
		return fmt.Errorf("remove %s: %w", rel, err)
	}
	return nil
}

// validateRelPath rejects absolute paths and traversal outside the work tree
// before rel is ever joined onto it.
func validateRelPath(rel string) error {
	clean := filepath.Clean(rel)
	if filepath.IsAbs(clean) || clean == ".." ||
		strings.HasPrefix(clean, ".."+string(filepath.Separator)) {
		return fmt.Errorf("invalid repository path %q", rel)
	}
	return nil
}
