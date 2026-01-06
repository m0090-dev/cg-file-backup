//go:build !windows
package main
import (
	"os/exec"
)

// CreateHdiff は外部バイナリ hdiffz を呼び出して差分を作成します (Unix版)
func (a *App) CreateHdiff(OldFile, NewFile, DiffFile string) error {
	// Unix系では特権的なフラグ設定なしで実行
	cmd := exec.Command("hdiffz", "-f", "-s", "-c-bzip2", OldFile, NewFile, DiffFile)
	err := cmd.Run()
	if err == nil {
		return nil 
	}
	cmdFallback := exec.Command("hdiffz", "-f", "-s", OldFile, NewFile, DiffFile)
	return cmdFallback.Run()
}

// ApplyHdiff は外部バイナリ hpatchz を呼び出してパッチを適用します (Unix版)
func (a *App) ApplyHdiff(baseFull, diffFile, outPath string) error {
	cmd := exec.Command("hpatchz", "-f", "-s", baseFull, diffFile, outPath)
	return cmd.Run()
}
