import os
import sys
import shutil
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

    # 2. 出力用フォルダの準備
    if os.path.exists(dist_dir):
        shutil.rmtree(dist_dir)
    os.makedirs(dist_dir)

    print(f"--- Packaging {project_name} version {version} ---")

    # 3. build/bin 内のファイルをすべてコピー (OS不問で中身を全部信じる)
    # Wailsのビルド成果物はここに出力されるため、ここにあるファイルは全て必要と判断
    target_build_dir = "build/bin"
    if not os.path.exists(target_build_dir):
        target_build_dir = "build" # binがない場合のフォールバック

    if os.path.exists(target_build_dir):
        for item in os.listdir(target_build_dir):
            src_path = os.path.join(target_build_dir, item)
            # フォルダ（frontend等）は除外し、ファイルのみをコピー
            if os.path.isfile(src_path):
                print(f"Copying build artifact: {item}")
                shutil.copy2(src_path, dist_dir)
    else:
        print("Warning: Build directory not found.")

    # 4. ルートからは「特定の必須フォルダ」のみをコピー
    required_bins = ["hdiff-bin", "bzip2-bin"]
    for bin_dir in required_bins:
        if os.path.exists(bin_dir):
            print(f"Copying external dependency: {bin_dir}")
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
        shutil.make_archive(dist_dir, 'zip', root_dir=".", base_dir=dist_dir)
        print(f"Archive created: {dist_dir}.zip")

        if args.clean:
            print(f"Removing source directory: {dist_dir}")
            shutil.rmtree(dist_dir)

    print("--- Done! ---")

if __name__ == "__main__":
    create_release_package()
