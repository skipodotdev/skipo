package system

// openDefault hands the file to the desktop's default handler when no
// $VISUAL/$EDITOR is set. xdg-open resolves the user's chosen application.
func (s *Service) openDefault(full string) error {
	return s.run("xdg-open", full)
}
