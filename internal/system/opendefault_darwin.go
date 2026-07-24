package system

// openDefault opens the file in the default text editor when no $VISUAL/$EDITOR
// is set. `open -t` targets the editor bound to the Default Editor, not the
// file type's app, so a source file lands in an editor rather than a viewer.
func (s *Service) openDefault(full string) error {
	return s.run("open", "-t", full)
}
