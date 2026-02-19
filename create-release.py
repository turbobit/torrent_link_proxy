#!/usr/bin/env python3
"""
Chrome Web Store Release Package Creator for Torrent Link Proxy
Works on Windows, Linux, and Mac
Usage: python3 create-release.py
"""

import os
import shutil
import zipfile
from pathlib import Path

def create_release_zip():
    # Get project directory
    project_dir = Path(__file__).parent
    release_dir = project_dir / "release"
    zip_path = project_dir / "torrent-link-proxy.zip"

    # Clean up existing release folder
    if release_dir.exists():
        shutil.rmtree(release_dir)

    release_dir.mkdir()

    # Files to include
    files_to_copy = [
        "manifest.json",
        "background.js",
        "content.js",
        "popup.html",
        "popup.js",
        "options.html",
        "options.js",
        "icon16.svg",
        "icon48.svg",
        "icon128.svg"
    ]

    print("Copying necessary files...")
    for file_name in files_to_copy:
        source_path = project_dir / file_name
        if source_path.exists():
            shutil.copy(source_path, release_dir)
            print(f"  OK: {file_name}")
        else:
            print(f"  SKIP: {file_name} (not found)")

    # Copy locales directory
    locales_dir = project_dir / "_locales"
    if locales_dir.exists():
        shutil.copytree(locales_dir, release_dir / "_locales")
        print("  OK: _locales folder")

    # Remove existing zip
    if zip_path.exists():
        zip_path.unlink()

    # Create zip file
    print("\nCreating zip file...")
    with zipfile.ZipFile(zip_path, 'w', zipfile.ZIP_DEFLATED) as zipf:
        for file_path in release_dir.rglob('*'):
            if file_path.is_file():
                arcname = file_path.relative_to(release_dir)
                zipf.write(file_path, arcname)

    if zip_path.exists():
        zip_size = zip_path.stat().st_size / 1024
        print(".2f")
        print("\nReady for deployment!")
        print(f"File: {zip_path}")
        print("\nNext steps:")
        print("1. Go to https://chrome.google.com/webstore/devconsole")
        print("2. Click 'New item'")
        print(f"3. Upload {zip_path.name}")
    else:
        print("ERROR: Failed to create zip file")
        return False

    # Cleanup
    print("\nCleaning up...")
    shutil.rmtree(release_dir)
    print("Done!")
    return True

if __name__ == "__main__":
    try:
        success = create_release_zip()
        exit(0 if success else 1)
    except Exception as e:
        print(f"ERROR: {e}")
        exit(1)