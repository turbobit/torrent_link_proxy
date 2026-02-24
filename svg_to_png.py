#!/usr/bin/env python3
"""
Convert SVG to PNG using element parsing
"""

from PIL import Image, ImageDraw
import xml.etree.ElementTree as ET
import re

def svg_to_png(svg_path, png_path):
    """Convert SVG to PNG by parsing elements"""
    # Create image
    img = Image.new('RGBA', (128, 128), (255, 255, 255, 0))
    draw = ImageDraw.Draw(img)

    # Parse SVG
    tree = ET.parse(svg_path)
    root = tree.getroot()

    # Process elements
    for elem in root:
        tag = elem.tag.split('}')[-1]  # Remove namespace

        if tag == 'rect':
            # Rectangle
            x = float(elem.get('x', 0))
            y = float(elem.get('y', 0))
            width = float(elem.get('width', 128))
            height = float(elem.get('height', 128))
            fill = elem.get('fill', '#000000')
            rx = elem.get('rx')

            # Convert hex to RGB
            if fill.startswith('#'):
                r = int(fill[1:3], 16)
                g = int(fill[3:5], 16)
                b = int(fill[5:7], 16)
                color = (r, g, b)
            else:
                color = (0, 0, 0)

            # Draw rectangle
            if rx:
                # Rounded rectangle (simple approximation)
                draw.rectangle([x, y, x+width, y+height], fill=color)
            else:
                draw.rectangle([x, y, x+width, y+height], fill=color)

        elif tag == 'path':
            # Simple path parsing for the house shape
            d = elem.get('d', '')
            fill = elem.get('fill', '#000000')

            # Convert hex to RGB
            if fill.startswith('#'):
                r = int(fill[1:3], 16)
                g = int(fill[3:5], 16)
                b = int(fill[5:7], 16)
                color = (r, g, b)
            else:
                color = (0, 0, 0)

            # Parse the house path: M64 16L32 48V112h64V48L64 16z
            # This creates a house shape - let's approximate with polygons
            if 'M64 16L32 48V112h64V48L64 16z' in d:
                # House outline
                points = [(64, 16), (32, 48), (32, 112), (96, 112), (96, 48)]
                draw.polygon(points, fill=color)
            # Parse the play button path: M64 32L96 64L64 96L32 64L64 32z
            elif 'M64 32L96 64L64 96L32 64L64 32z' in d:
                # Play button triangle
                points = [(64, 32), (96, 64), (64, 96), (32, 64)]
                draw.polygon(points, fill=color)

        elif tag == 'circle':
            # Circle
            cx = float(elem.get('cx', 0))
            cy = float(elem.get('cy', 0))
            r = float(elem.get('r', 0))
            fill = elem.get('fill', '#000000')
            opacity = float(elem.get('opacity', 1.0))

            # Convert hex to RGB with opacity
            if fill.startswith('#'):
                r_color = int(fill[1:3], 16)
                g_color = int(fill[3:5], 16)
                b_color = int(fill[5:7], 16)
                color = (r_color, g_color, b_color, int(opacity * 255))
            else:
                color = (0, 0, 0, int(opacity * 255))

            # Draw circle
            draw.ellipse([cx-r, cy-r, cx+r, cy+r], fill=color)

    # Save PNG
    img.save(png_path, 'PNG')
    print(f"Successfully converted {svg_path} to {png_path}")
    return True

if __name__ == "__main__":
    svg_to_png("icon128.svg", "icon128.png")