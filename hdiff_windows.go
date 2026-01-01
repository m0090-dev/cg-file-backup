//go:build windows
package main

import (
	"os/exec"
	"syscall"
)

// CreateHdiff は外部バイナリ hdiffz を呼び出して差分を作成します (Windows版)
func (a *App) CreateHdiff(OldFile, NewFile, DiffFile string) error {
	// -f: 強制上書き, -s: ストリーミング, -c-bzip2: 圧縮
	cmd := exec.Command("hdiffz", "-f", "-s", "-c-bzip2", OldFile, NewFile, DiffFile)
	
	// Windowsでコンソールウィンドウを表示させない設定
	cmd.SysProcAttr = &syscall.SysProcAttr{
		HideWindow:    true,
		CreationFlags: 0x08000000, // CREATE_NO_WINDOW
	}
	
	return cmd.Run()
}

// ApplyHdiff は外部バイナリ hpatchz を呼び出してパッチを適用します (Windows版)
func (a *App) ApplyHdiff(baseFull, diffFile, outPath string) error {
	// -f: 強制上書き, -s: ストリーミング
	cmd := exec.Command("hpatchz", "-f", "-s", baseFull, diffFile, outPath)
	
	cmd.SysProcAttr = &syscall.SysProcAttr{
		HideWindow:    true,
		CreationFlags: 0x08000000,
	}
	
	return cmd.Run()
}
