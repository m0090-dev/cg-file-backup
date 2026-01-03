import os
import sys
import shutil
import argparse
import subprocess

def create_release_package():
    # 1. 引数の設定
    parser = argparse.ArgumentParser(description="cg-file-backup packaging script")
    parser.add_argument("version", help="Version string (e.g. 0.0.1)")
    parser.add_argument("--zip", action="store_true", help="Create a zip archive of the package")
    parser.add_argument("--clean", action="store_true", help="Remove folders after processing")
    
    args = parser.parse_args()

    version = args.version
    project_name = "cg-file-backup"
    dist_dir = f"{project_name}-{version}"

    # 2. 出力用フォルダ（共通配布用：ZIP用）の準備
    if os.path.exists(dist_dir):
        shutil.rmtree(dist_dir)
    os.makedirs(dist_dir)

    print(f"--- Packaging {project_name} version {version} ---")

    # 3. build/bin 内のファイルをコピー
    target_build_dir = "build/bin"
    if not os.path.exists(target_build_dir):
        target_build_dir = "build"

    artifacts = []
    if os.path.exists(target_build_dir):
        for item in os.listdir(target_build_dir):
            src_path = os.path.join(target_build_dir, item)
            if os.path.isfile(src_path):
                print(f"Copying build artifact: {item}")
                shutil.copy2(src_path, dist_dir)
                artifacts.append(item)
    else:
        print("Warning: Build directory not found.")

    # 4. 外部依存ディレクトリのコピー
    required_bins = ["hdiff-bin", "bzip2-bin"]
    for bin_dir in required_bins:
        if os.path.exists(bin_dir):
            print(f"Copying external dependency: {bin_dir}")
            shutil.copytree(bin_dir, os.path.join(dist_dir, bin_dir))

    # 5. LICENSE/CREDITSのコピー
    found_license = None
    for pattern in ["LICENSE", "LICENSE.txt", "LICENSE.md"]:
        if os.path.exists(pattern):
            shutil.copy2(pattern, dist_dir)
            found_license = pattern
            break
    
    for pattern in ["CREDITS", "CREDITS.txt", "CREDITS.md"]:
        if os.path.exists(pattern):
            shutil.copy2(pattern, dist_dir)
            break

    # 6. Linux環境での .deb パッケージ作成
    deb_file_path = f"{dist_dir}.deb"
    if sys.platform.startswith('linux'):
        print(f"--- Creating .deb package for Linux ---")
        deb_root = f"{dist_dir}_deb"
        if os.path.exists(deb_root): shutil.rmtree(deb_root)
        
        try:
            bin_path = os.path.join(deb_root, "usr/bin")
            doc_path = os.path.join(deb_root, f"usr/share/doc/{project_name}")
            os.makedirs(bin_path, exist_ok=True)
            os.makedirs(doc_path, exist_ok=True)
            os.makedirs(os.path.join(deb_root, "DEBIAN"), exist_ok=True)

            # Linux版 .deb には .exe や .dll を含めない
            for item in artifacts:
                if not (item.endswith('.exe') or item.endswith('.dll')):
                    target = shutil.copy2(os.path.join(dist_dir, item), bin_path)
                    os.chmod(target, 0o755)
                    print(f"Included in deb: {item}")
            
            # 外部バイナリフォルダもLinux版のみを厳選してコピー
            for rb in required_bins:
                src_rb = os.path.join(dist_dir, rb)
                if os.path.exists(src_rb):
                    dest_rb = os.path.join(bin_path, rb)
                    os.makedirs(dest_rb, exist_ok=True)
                    for f in os.listdir(src_rb):
                        # exeなどは除外（Linux用バイナリのみコピー）
                        if not (f.endswith('.exe') or f.endswith('.dll')):
                            src_f = os.path.join(src_rb, f)
                            dest_f = shutil.copy2(src_f, dest_rb)
                            os.chmod(dest_f, 0o755)

            if found_license:
                shutil.copy2(found_license, os.path.join(doc_path, "copyright"))

            # controlファイルの作成 (DependsにWebView2相当のライブラリを追加)
            # Wailsの標準的な依存関係：libwebkit2gtk-4.0-37, libgtk-3-0
            control_content = f"""Package: {project_name}
Version: {version}
Section: utils
Priority: optional
Architecture: amd64
Maintainer: Developer <dev@example.com>
Depends: libwebkit2gtk-4.0-37, libgtk-3-0, libgluegen2-rt-java
Description: {project_name} backup tool
 A file backup utility using Wails (WebView2).
 Includes hdiff and bzip2 dependencies.
"""
            with open(os.path.join(deb_root, "DEBIAN/control"), "w") as f:
                f.write(control_content)

            subprocess.run(["dpkg-deb", "--build", deb_root, deb_file_path], check=True)
            print(f"Successfully created: {deb_file_path}")
            shutil.copy2(deb_file_path, dist_dir)
            
            if args.clean:
                shutil.rmtree(deb_root)
        except Exception as e:
            print(f"Skipping .deb creation: {e}")

    # 7. ZIP圧縮処理
    if args.zip:
        print(f"--- Archiving to {dist_dir}.zip ---")
        shutil.make_archive(dist_dir, 'zip', root_dir=".", base_dir=dist_dir)
        print(f"Archive created: {dist_dir}.zip")

    # 8. クリーンアップ
    if args.clean:
        print(f"Cleaning up source directory: {dist_dir}")
        if os.path.exists(dist_dir):
            shutil.rmtree(dist_dir)
        if os.path.exists(deb_file_path):
            os.remove(deb_file_path)

    print("--- Done! ---")

if __name__ == "__main__":
    create_release_package()
