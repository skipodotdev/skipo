package system

// openDefault hands the file to the shell's file association when no
// $VISUAL/$EDITOR is set. `start` is a cmd builtin, hence `cmd /c`; the empty
// first argument is start's title slot, which a quoted path would otherwise
// consume.
func (s *Service) openDefault(full string) error {
	return s.run("cmd", "/c", "start", "", full)
}
