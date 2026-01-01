package main

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/kr/binarydist"
)

// ----------------- 差分・履歴管理 (BSDIFF・判別対応版) -----------------

// BackupOrBsdiff は明示的に bsdiff を作成する場合も、新ルールに基づいた名前で保存します
func (a *App) BackupOrBsdiff(workFile, customDir string) error {
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
	// ★アルゴリズム名 (.bsdiff) を含めることで一括復元時の誤作動を防ぐ
	diffPath := filepath.Join(targetDir, fmt.Sprintf("%s.%s.bsdiff.diff", baseName, ts))
	
	return a.CreateBsdiff(baseFull, workFile, diffPath)
}

// CreateBsdiff は純粋にバイナリ差分を作成します
func (a *App) CreateBsdiff(OldFile, NewFile, DiffFile string) error {
	oldF, err := os.Open(OldFile)
	if err != nil { return err }
	defer oldF.Close()

	newF, err := os.Open(NewFile)
	if err != nil { return err }
	defer newF.Close()

	diffF, err := os.Create(DiffFile)
	if err != nil { return err }
	defer diffF.Close()

	return binarydist.Diff(oldF, newF, diffF)
}



// ApplyBsdiff は新旧のファイル名規則に対応し、ベースファイルを特定します
func (a *App) ApplyBsdiff(workFile, diffFile string) error {
	backupDir := filepath.Dir(diffFile)
	baseName := filepath.Base(diffFile)

	var guessedBaseName string

	// --- ベースファイル名の推測 ---
	// 新仕様: filename.20260101_120000.bsdiff.diff (セグメントが多い)
	if strings.Count(baseName, ".") >= 3 && (strings.Contains(baseName, ".bsdiff.") || strings.Contains(baseName, ".hdiff.")) {
		parts := strings.Split(baseName, ".")
		// 後ろから3つ (.timestamp.algo.diff) を除いたものが元のファイル名
		guessedBaseName = strings.Join(parts[:len(parts)-3], ".") + ".base"
	} else {
		// 旧仕様: filename.20240101_120000.diff 
		// ".20" (日付の始まり) で分割してベース名を取得
		guessedBaseName = strings.Split(baseName, ".20")[0] + ".base"
	}

	baseFull := filepath.Join(backupDir, guessedBaseName)

	// 推測したベースが見つからない場合、現在開いているファイル名.base を最終確認
	if _, err := os.Stat(baseFull); os.IsNotExist(err) {
		baseFull = filepath.Join(backupDir, filepath.Base(workFile)+".base")
	}

	// ファイルの存在確認
	if _, err := os.Stat(baseFull); os.IsNotExist(err) {
		return fmt.Errorf("ベースファイル (.base) が見つかりません: %s", guessedBaseName)
	}

	// --- 実際のパッチ処理 ---
	oldF, err := os.Open(baseFull)
	if err != nil { return err }
	defer oldF.Close()

	patchF, err := os.Open(diffFile)
	if err != nil { return err }
	defer patchF.Close()

	outPath := autoOutputPath(workFile)
	outF, err := os.Create(outPath)
	if err != nil { return err }
	defer outF.Close()

	// binarydist (Bsdiff) によるパッチ
	return binarydist.Patch(oldF, outF, patchF)
}

// ApplyMultiBsdiff はリストを受け取って順次適用します
func (a *App) ApplyMultiBsdiff(workFile string, diffPaths []string) error {
	for _, dp := range diffPaths {
		if err := a.ApplyBsdiff(workFile, dp); err != nil {
			return err
		}
	}
	return nil
}
