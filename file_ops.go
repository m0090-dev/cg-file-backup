package main
import (
	"os"
	"io"
	"strings"
	"path/filepath"
	"archive/tar"
	"archive/zip"
	"compress/gzip"
	pwzip "github.com/alexmullins/zip"
)


// ヘルパー: Readerの内容をワークファイルに書き出す
func (a *App) saveToWorkFile(r io.Reader, targetFile string) error {
	out, err := os.Create(targetFile)
	if err != nil {
		return err
	}
	defer out.Close()
	if _, err = io.Copy(out, r); err != nil {
		return err
	}
	return out.Sync() // ディスクへの書き込みを確定させる
}

// WriteTextFile は指定されたパスに文字列を書き込みます（汎用）
func (a *App) WriteTextFile(path string, content string) error {
	// フォルダが存在しない可能性も考慮する場合はここで作成しても良い
	return os.WriteFile(path, []byte(content), 0644)
}

// ReadTextFile は指定されたパスのファイルを文字列として読み込みます（汎用）
func (a *App) ReadTextFile(path string) (string, error) {
	if _, err := os.Stat(path); os.IsNotExist(err) {
		return "", nil // ファイルがない場合はエラーにせず空文字を返す
	}
	b, err := os.ReadFile(path)
	if err != nil {
		return "", err
	}
	return string(b), nil
}

func (a *App) GetBackupList(workFile, backupDir string) ([]BackupItem, error) {
	if backupDir == "" {
		backupDir = DefaultBackupDir(workFile)
	}

	files, err := os.ReadDir(backupDir)
	if err != nil {
		return nil, err
	}

	var list []BackupItem
	baseNameOnly := strings.TrimSuffix(filepath.Base(workFile), filepath.Ext(workFile))

	for _, f := range files {
		if f.IsDir() {
			continue
		}
		name := f.Name()

		// 1. ワークファイル名が含まれているか確認
		if !strings.Contains(name, baseNameOnly) {
			continue
		}

		// 2. 拡張子のフィルタリング
		// .tar.gz は特殊なので、HasSuffix で判定するのが確実です
		isValidExt := false
		if strings.HasSuffix(name, ".diff") ||
			strings.HasSuffix(name, ".zip") ||
			strings.HasSuffix(name, ".tar.gz") || 
			strings.HasSuffix(name,".tar") ||
			strings.HasSuffix(name,".gz") {
			isValidExt = true
		}

		if isValidExt {
			info, err := f.Info()
			if err != nil {
				continue
			} // 情報が取得できない場合はスキップ

			list = append(list, BackupItem{
				FileName:  name,
				FilePath:  filepath.Join(backupDir, name),
				Timestamp: info.ModTime().Format("2006-01-02 15:04:05"),
				FileSize:  info.Size(),
			})
		}
	}
	return list, nil
}

// CopyBackupFile はファイルをそのままコピーします
func (a *App) CopyBackupFile(src, backupDir string) error {
	if backupDir == "" {
		backupDir = DefaultBackupDir(src)
	}
	if err := os.MkdirAll(backupDir, 0755); err != nil {
		return err
	}
	return CopyFile(src, filepath.Join(backupDir, TimestampedName(src)))
}

// ArchiveBackupFile は指定された形式で圧縮バックアップを作成します
func (a *App) ArchiveBackupFile(src, backupDir, format, password string) error {
	if backupDir == "" {
		backupDir = DefaultBackupDir(src)
	}
	if err := os.MkdirAll(backupDir, 0755); err != nil {
		return err
	}

	if format == "zip" {
		return ZipBackupFile(src, backupDir, password)
	}
	// Tarはパスワード非対応
	return TarBackupFile(src, backupDir)
}

// ZipBackupFile はパスワードの有無によりライブラリを使い分けてZIPを作成します
func ZipBackupFile(src, backupDir, password string) error {
	zipPath := filepath.Join(backupDir, TimestampedName(strings.TrimSuffix(filepath.Base(src), filepath.Ext(src))+".zip"))

	zf, err := os.Create(zipPath)
	if err != nil {
		return err
	}
	defer zf.Close()

	f, err := os.Open(src)
	if err != nil {
		return err
	}
	defer f.Close()

	if password != "" {
		// --- パスワードあり (alexmullins/zip を使用) ---
		archive := pwzip.NewWriter(zf)
		defer archive.Close()

		// ライブラリのサンプルに従い、Encrypt で直接 Writer を作成
		// 引数は (ファイル名, パスワード) の2つのみ
		writer, err := archive.Encrypt(filepath.Base(src), password)
		if err != nil {
			return err
		}

		_, err = io.Copy(writer, f)
		if err != nil {
			return err
		}

		return archive.Flush() // 書き込みを確定させるために Flush を呼ぶ

	} else {
		// --- パスワードなし (標準 archive/zip を使用) ---
		archive := zip.NewWriter(zf)
		defer archive.Close()

		info, err := f.Stat()
		if err != nil {
			return err
		}

		header, err := zip.FileInfoHeader(info)
		if err != nil {
			return err
		}
		header.Name = filepath.Base(src)
		header.Method = zip.Deflate

		writer, err := archive.CreateHeader(header)
		if err != nil {
			return err
		}

		_, err = io.Copy(writer, f)
		return err
	}
}

// TarBackupFile は .tar.gz 形式で圧縮します
func TarBackupFile(src, backupDir string) error {
	tarPath := filepath.Join(backupDir, TimestampedName(strings.TrimSuffix(filepath.Base(src), filepath.Ext(src))+".tar.gz"))
	tf, err := os.Create(tarPath)
	if err != nil {
		return err
	}
	defer tf.Close()

	gw := gzip.NewWriter(tf)
	defer gw.Close()
	tw := tar.NewWriter(gw)
	defer tw.Close()

	f, err := os.Open(src)
	if err != nil {
		return err
	}
	defer f.Close()

	info, err := f.Stat()
	if err != nil {
		return err
	}
	header, err := tar.FileInfoHeader(info, "")
	if err != nil {
		return err
	}
	header.Name = filepath.Base(src)

	if err := tw.WriteHeader(header); err != nil {
		return err
	}
	_, err = io.Copy(tw, f)
	return err
}



// CopyFile は単純なファイルコピーを行います
func CopyFile(src, dst string) error {
	if err := os.MkdirAll(filepath.Dir(dst), 0755); err != nil {
		return err
	}
	in, err := os.Open(src)
	if err != nil {
		return err
	}
	defer in.Close()
	out, err := os.Create(dst)
	if err != nil {
		return err
	}
	defer out.Close()
	if _, err := io.Copy(out, in); err != nil {
		return err
	}
	return out.Sync()
}



