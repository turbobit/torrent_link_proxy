from __future__ import annotations

from pathlib import Path

from PIL import Image


def resize_icon(source: Image.Image, size: int, destination: Path) -> None:
    """Resize the source icon down to the requested size."""
    resized = source.resize((size, size), Image.LANCZOS)
    resized.save(destination)


def main() -> None:
    root = Path(__file__).resolve().parents[1]
    source_png = root / "icon128.png"
    if not source_png.exists():
        raise FileNotFoundError(f"{source_png} 누락됨")

    source_icon = Image.open(source_png)
    for size in (48, 16):
        target_path = root / f"icon{size}.png"
        resize_icon(source_icon, size, target_path)
        print(f"{target_path.name} 생성 완료")


if __name__ == "__main__":
    main()
