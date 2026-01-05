package main

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"time"
)





func (a *App) BackupOrDiff(workFile, customDir, algo string) error {
	root := customDir
	if root == "" {
		root = DefaultBackupDir(workFile)
	}

	// 1. 現在の書き込み先を特定 (baseN)
	targetDir, currentIdx, err := a.ResolveGenerationDir(root, workFile)
	if err != nil {
		return err
	}

	baseName := filepath.Base(workFile)
	baseFull := filepath.Join(targetDir, baseName+".base")
	// A. .baseファイル自体の存在チェック
	baseExists := true
	if _, err := os.Stat(baseFull); os.IsNotExist(err) {
		baseExists = false
	}


	// 【自己修復トリガー】
	// .baseがない
	if !baseExists{
		// 現在の作業ファイルを .base として強制コピー（リベース）
		if err := CopyFile(workFile, baseFull); err != nil {
			return fmt.Errorf("failed to sync base file: %w", err)
		}
	}
	// --- 修復完了 ---

	ts := time.Now().Format("20060102_150405")
	tempDiff := filepath.Join(os.TempDir(), fmt.Sprintf("%s.%s.tmp", baseName, ts))
	
	// 差分生成 (baseFull の存在が保証されている)
	if algo == "bsdiff" {
		err = a.CreateBsdiff(baseFull, workFile, tempDiff)
	} else {
		err = a.CreateHdiff(baseFull, workFile, tempDiff)
	}
	if err != nil {
		os.Remove(tempDiff)
		return err
	}

	// 2. サイズ判定
	workStat, _ := os.Stat(workFile)
	diffStat, _ := os.Stat(tempDiff)
	threshold := a.GetAutoBaseGenerationThreshold()
	workSize := workStat.Size()
	diffSize := diffStat.Size()

	if threshold <= 0 { threshold = 0.8 }
	
	shouldNextGen := false
	if workSize > 100*1024 { // 100KBより大きい場合のみ閾値判定
		if float64(diffSize) > float64(workSize)*threshold {
			shouldNextGen = true
		}
	}
	
	if shouldNextGen {
	
		// --- 3a. 【サイズ超過】 世代交代ロジック ---
		os.Remove(tempDiff)

		newIdx := currentIdx + 1
		newGenDir, err := a.CreateNewGeneration(root, newIdx, workFile)
		if err != nil {
			return err
		}

	

		newBaseFull := filepath.Join(newGenDir, baseName+".base")
		finalPath := filepath.Join(newGenDir, fmt.Sprintf("%s.%s.%s.diff", baseName, ts, algo))
		
		if algo == "bsdiff" {
			return a.CreateBsdiff(newBaseFull, workFile, finalPath)
		}
		return a.CreateHdiff(newBaseFull, workFile, finalPath)
	}

	// --- 3b. 【正常】 移動して確定 ---
	finalPath := filepath.Join(targetDir, fmt.Sprintf("%s.%s.%s.diff", baseName, ts, algo))
	return os.Rename(tempDiff, finalPath)
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
