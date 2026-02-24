#!/usr/bin/env python3
"""
Convert SVG to PNG using svglib and PIL
"""

from svglib.svglib import svg2rlg
from reportlab.graphics import renderPM
import sys

def svg_to_png(svg_path, png_path, width=128, height=128):
    """Convert SVG file to PNG"""
    try:
        # Convert SVG to ReportLab Graphics object
        drawing = svg2rlg(svg_path)

        # Render to PNG
        renderPM.drawToFile(drawing, png_path, fmt="PNG")

        print(f"Successfully converted {svg_path} to {png_path}")
        return True

    except Exception as e:
        print(f"Error converting SVG to PNG: {e}")
        return False

if __name__ == "__main__":
    # Convert icon128.svg to icon128.png
    svg_to_png("icon128.svg", "icon128.png")