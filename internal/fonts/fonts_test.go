package fonts

import (
	"os/exec"
	"reflect"
	"testing"
)

func TestListSmoke(t *testing.T) {
	if _, err := exec.LookPath("fc-list"); err != nil {
		t.Skip("fc-list not installed")
	}
	got, err := New().List()
	if err != nil {
		t.Fatalf("List() error = %v", err)
	}
	if len(got) == 0 {
		t.Error("List() returned no families")
	}
}

func TestParseFamilies(t *testing.T) {
	out := "Fira Code\nMonaco\nFira Code\nNoto Sans,Noto Sans CJK\n\n  \n"
	got := parseFamilies(out)
	want := []string{"Fira Code", "Monaco", "Noto Sans"}
	if !reflect.DeepEqual(got, want) {
		t.Errorf("parseFamilies = %v, want %v", got, want)
	}
}
