package sync

import (
	"crypto/md5"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"sort"
	"strings"
)

// 与客户端（front-end core/sync.ts）严格一致的指纹算法：
// 文件按 path 字典序排序，拼接 md5(path + "\0" + content + "\0")，对拼接串再 md5。
func FingerPrint(files map[string]string) string {
	paths := make([]string, 0, len(files))
	for p := range files {
		paths = append(paths, p)
	}
	sort.Strings(paths)
	h := md5.New()
	inner := md5.New()
	for _, p := range paths {
		inner.Reset()
		_, _ = inner.Write([]byte(p))
		_, _ = inner.Write([]byte{0})
		_, _ = inner.Write([]byte(files[p]))
		_, _ = inner.Write([]byte{0})
		_, _ = h.Write(inner.Sum(nil))
	}
	return hex.EncodeToString(h.Sum(nil))
}

func Sha256(content string) string {
	sum := sha256.Sum256([]byte(content))
	return hex.EncodeToString(sum[:])
}

// ---- 推送请求校验（方案 §7 约束）----

const (
	MaxFileCount     = 2000
	MaxFileBytes     = 2 << 20  // 单文件 2MB
	MaxProjectBytes  = 12 << 20 // 单项目文本总量 12MB（文档内嵌上限留余量）
	MaxPathLen       = 512
)

var (
	ErrBadPath      = errors.New("illegal file path")
	ErrTooManyFiles = errors.New("too many files")
	ErrFileTooLarge = errors.New("single file exceeds 2MB")
	ErrTooLarge     = errors.New("project text exceeds 12MB")
)

// ValidPath 校验单个路径：非空、无 ../、不以 / 开头、无反斜杠、无控制字符
func ValidPath(p string) bool {
	if p == "" || len(p) > MaxPathLen || strings.HasPrefix(p, "/") || strings.Contains(p, "\\") {
		return false
	}
	if p == "." || p == ".." || strings.Contains(p, "../") || strings.Contains(p, "/../") || strings.HasSuffix(p, "/..") {
		return false
	}
	for _, r := range p {
		if r < 0x20 || r == 0x7f {
			return false
		}
	}
	return true
}
