import os
import sys
import shutil
import glob
import argparse

def create_release_package():
    # 1. 引数の設定
    parser = argparse.ArgumentParser(description="cg-file-backup packaging script")
    parser.add_argument("version", help="Version string (e.g. 0.0.1)")
    parser.add_argument("--zip", action="store_true", help="Create a zip archive of the package")
    parser.add_argument("--clean", action="store_true", help="Remove the folder after zipping (requires --zip)")
    
    args = parser.parse_args()

    version = args.version
    project_name = "cg-file-backup"
    dist_dir = f"{project_name}-{version}"

    # 2. 出力用フォルダの作成
    if os.path.exists(dist_dir):
        print(f"Cleaning up old directory: {dist_dir}")
        shutil.rmtree(dist_dir)
    os.makedirs(dist_dir)

    print(f"--- Packaging {project_name} version {version} ---")

    # 3. ビルド済みバイナリのコピー
    build_paths = ["build/bin", "build"]
    found_binaries = False
    for bp in build_paths:
        if os.path.exists(bp):
            for item in os.listdir(bp):
                src_path = os.path.join(bp, item)
                if os.path.isfile(src_path):
                    if item.endswith(".exe") or "." not in item:
                        print(f"Copying binary: {item}")
                        shutil.copy2(src_path, dist_dir)
                        found_binaries = True
    
    if not found_binaries:
        print("Warning: No binaries found.")

    # 4. ルートにある *-bin フォルダをコピー
    required_bins = ["hdiff-bin", "bzip2-bin"]
    for bin_dir in required_bins:
        if os.path.exists(bin_dir):
            print(f"Copying directory: {bin_dir}")
            shutil.copytree(bin_dir, os.path.join(dist_dir, bin_dir))

    # 5. LICENSEファイルのコピー
    license_patterns = ["LICENSE", "LICENSE.txt", "LICENSE.md"]
    for pattern in license_patterns:
        if os.path.exists(pattern):
            print(f"Copying license: {pattern}")
            shutil.copy2(pattern, dist_dir)
            break

    # 6. ZIP圧縮処理
    if args.zip:
        print(f"--- Archiving to {dist_dir}.zip ---")
        # base_name: 作成するファイル名(拡張子除く), format: 形式, root_dir: 圧縮する対象
        shutil.make_archive(dist_dir, 'zip', root_dir=".", base_dir=dist_dir)
        print(f"Archive created: {dist_dir}.zip")

        # 7. クリーンアップ処理
        if args.clean:
            print(f"Removing source directory: {dist_dir}")
            shutil.rmtree(dist_dir)

    print("---")
    print(f"Done!")

if __name__ == "__main__":
    create_release_package()
