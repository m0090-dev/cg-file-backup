package main

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"time"
)





// BackupOrDiff はアルゴリズム名をファイル名に含めて保存します
func (a *App) BackupOrDiff(workFile, customDir, algo string) error {
	targetDir := customDir
	if targetDir == "" {
		targetDir = DefaultBackupDir(workFile)
	}
	if err := os.MkdirAll(targetDir, 0755); err != nil {
		return err
	}

	baseName := filepath.Base(workFile)
	baseFull := filepath.Join(targetDir, baseName+".base")

	if _, err := os.Stat(baseFull); os.IsNotExist(err) {
		if err := CopyFile(workFile, baseFull); err != nil {
			return err
		}
	}

	ts := time.Now().Format("20060102_150405")
	
	// ★重要: ファイル名にアルゴリズムを明示する (例: test.clip.20230101.bsdiff.diff)
	diffPath := filepath.Join(targetDir, fmt.Sprintf("%s.%s.%s.diff", baseName, ts, algo))

	if algo == "bsdiff" {
		return a.CreateBsdiff(baseFull, workFile, diffPath)
	}
	// デフォルトは Hdiff
	return a.CreateHdiff(baseFull, workFile, diffPath)
}

// ApplyMultiDiff は新旧混在・アルゴリズム不明でも自動判別＆リトライで適用します
func (a *App) ApplyMultiDiff(workFile string, diffPaths []string, _ string) error {
	for _, dp := range diffPaths {
		var err error
		baseName := filepath.Base(dp)

		// 1. ファイル名による明示的な判別
		if strings.Contains(baseName, ".bsdiff.") {
			err = a.ApplyBsdiff(workFile, dp)
		} else if strings.Contains(baseName, ".hdiff.") {
			err = a.ApplyHdiffWrapper(workFile, dp)
		} else {
			// 2. 識別子がない古い ".diff" ファイルの場合のリトライ戦略
			// まずは以前の主流だった Bsdiff で試行
			err = a.ApplyBsdiff(workFile, dp)
			if err != nil {
				// Bsdiff で失敗した場合、Hdiff としてリトライ
				fmt.Printf("Bsdiff failed for %s, retrying with Hdiff...\n", baseName)
				err = a.ApplyHdiffWrapper(workFile, dp)
			}
		}

		if err != nil {
			return fmt.Errorf("復元失敗。正しい差分ファイルではないか、ベースファイルが一致しません (%s): %w", baseName, err)
		}
	}
	return nil
}
