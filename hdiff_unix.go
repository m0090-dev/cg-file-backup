//go:build !windows
package main
import (
	"os/exec"
)

// CreateHdiff は外部バイナリ hdiffz を呼び出して差分を作成します (Unix版)
func (a *App) CreateHdiff(OldFile, NewFile, DiffFile string) error {
	// Unix系では特権的なフラグ設定なしで実行
	cmd := exec.Command("hdiffz", "-f", "-s", "-c-zstd", OldFile, NewFile, DiffFile)
	return cmd.Run()
}

// ApplyHdiff は外部バイナリ hpatchz を呼び出してパッチを適用します (Unix版)
func (a *App) ApplyHdiff(baseFull, diffFile, outPath string) error {
	cmd := exec.Command("hpatchz", "-f", "-s", baseFull, diffFile, outPath)
	return cmd.Run()
}
