//go:build windows
package binarydist

import (
	"io"
	"os/exec"
	"syscall"
)

type bzip2Writer struct {
	c *exec.Cmd
	w io.WriteCloser
}

func (w bzip2Writer) Write(b []byte) (int, error) {
	return w.w.Write(b)
}

func (w bzip2Writer) Close() error {
	if err := w.w.Close(); err != nil {
		return err
	}
	return w.c.Wait()
}

func newBzip2Writer(w io.Writer) (wc io.WriteCloser, err error) {
	var bw bzip2Writer
	bw.c = exec.Command("bzip2", "-c")
	
	// Windows 専用のフィールドを書いても、他 OS では無視されるのでエラーにならない
	bw.c.SysProcAttr = &syscall.SysProcAttr{
		HideWindow:    true,
		CreationFlags: 0x08000000,
	}

	bw.c.Stdout = w
	if bw.w, err = bw.c.StdinPipe(); err != nil {
		return nil, err
	}
	if err = bw.c.Start(); err != nil {
		return nil, err
	}
	return bw, nil
}
