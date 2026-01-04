package main
import (
	"strings"
	"os"
	"path/filepath"
	"fmt"
	"archive/tar"
	"archive/zip"
	"compress/gzip"
	"io"
)
// RestoreArchive は ZIP または TAR からファイルを復元します
func (a *App) RestoreArchive(archivePath, workFile string) error {
	ext := filepath.Ext(archivePath)
	_ = filepath.Dir(workFile)

	if ext == ".zip" {
		// ZIPの解凍
		r, err := zip.OpenReader(archivePath)
		if err != nil {
			return err
		}
		defer r.Close()

		for _, f := range r.File {
			// ワークファイル名と一致するファイル、または唯一のファイルを展開
			rc, err := f.Open()
			if err != nil {
				return err
			}
			defer rc.Close()

			dstFile, err := os.Create(workFile)
			if err != nil {
				return err
			}
			defer dstFile.Close()

			_, err = io.Copy(dstFile, rc)
			return err // 1つ目のファイルで終了（バックアップ用途のため）
		}
	} else if strings.HasSuffix(archivePath, ".tar.gz") {
		// TARの解凍
		f, err := os.Open(archivePath)
		if err != nil {
			return err
		}
		defer f.Close()

		gzr, err := gzip.NewReader(f)
		if err != nil {
			return err
		}
		defer gzr.Close()

		tr := tar.NewReader(gzr)
		for {
			_, err := tr.Next()
			if err == io.EOF {
				break
			}
			if err != nil {
				return err
			}

			dstFile, err := os.Create(workFile)
			if err != nil {
				return err
			}
			defer dstFile.Close()

			_, err = io.Copy(dstFile, tr)
			return err
		}
	}
	return fmt.Errorf("unsupported archive format")
}

// RestoreBackup はファイル形式を自動判別して復元を実行します
func (a *App) RestoreBackup(path, workFile string) error {
	ext := strings.ToLower(filepath.Ext(path))

	// 1. 差分パッチ (.diff)
	// ※ ApplyMultiDiff 内部で既に autoOutputPath が使われているのでそのままでOK
	if ext == ".diff" {
		return a.ApplyMultiDiff(workFile, []string{path}, "")
	}

	// ★ 復元先のパスを「別名」として生成する
	restoredPath := autoOutputPath(workFile)

	// 2. ZIPアーカイブ (.zip)
	if ext == ".zip" {
		r, err := zip.OpenReader(path)
		if err != nil {
			return err
		}
		defer r.Close()
		for _, f := range r.File {
			rc, err := f.Open()
			if err != nil {
				return err
			}
			defer rc.Close()
			// workFile ではなく restoredPath に保存
			return a.saveToWorkFile(rc, restoredPath)
		}
	}

	// 3. TARアーカイブ (.tar.gz)
	if strings.HasSuffix(strings.ToLower(path), ".tar.gz") {
		f, err := os.Open(path)
		if err != nil {
			return err
		}
		defer f.Close()
		gzr, err := gzip.NewReader(f)
		if err != nil {
			return err
		}
		defer gzr.Close()
		tr := tar.NewReader(gzr)
		if _, err := tr.Next(); err == nil {
			// workFile ではなく restoredPath に保存
			return a.saveToWorkFile(tr, restoredPath)
		}
	}

	// 4. フルコピー (.clip / .psd 等)
	// workFile ではなく restoredPath にコピー
	return CopyFile(path, restoredPath)
}
