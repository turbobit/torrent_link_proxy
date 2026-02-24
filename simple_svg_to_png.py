#!/usr/bin/env python3
"""
Simple SVG to PNG converter using PIL
"""

from PIL import Image, ImageDraw
import xml.etree.ElementTree as ET
import re

def parse_svg_path(d):
    """Simple SVG path parser - only handles basic commands"""
    commands = []
    # Split path data into commands and coordinates
    parts = re.findall(r'[MLHVCSQTAZmlhvcsqtaz]|-?\d*\.?\d+', d)

    i = 0
    while i < len(parts):
        cmd = parts[i]
        if cmd.upper() in 'MLHVCSQTAZ':
            commands.append((cmd.upper(), []))
            i += 1
        else:
            # This is a coordinate, add to last command
            if commands:
                commands[-1][1].append(float(parts[i]))
            i += 1

    return commands

def draw_svg_path(draw, commands, fill_color):
    """Draw SVG path commands"""
    points = []
    current_pos = [0, 0]

    for cmd, coords in commands:
        if cmd == 'M':  # Move to
            current_pos = [coords[0], coords[1]]
            points = [tuple(current_pos)]
        elif cmd == 'L':  # Line to
            current_pos = [coords[0], coords[1]]
            points.append(tuple(current_pos))
        elif cmd == 'Z':  # Close path
            if len(points) > 2:
                draw.polygon(points, fill=fill_color)

def svg_to_png_simple(svg_path, png_path, size=(128, 128)):
    """Convert simple SVG to PNG using PIL"""
    # Create white background image
    img = Image.new('RGBA', size, (255, 255, 255, 0))
    draw = ImageDraw.Draw(img)

    # Parse SVG
    tree = ET.parse(svg_path)
    root = tree.getroot()

    # Remove namespace for easier parsing
    for elem in root.iter():
        if '}' in elem.tag:
            elem.tag = elem.tag.split('}', 1)[1]

    # Process elements in order (back to front)
    for elem in root:
        if elem.tag == 'rect':
            # Rectangle
            x = float(elem.get('x', 0))
            y = float(elem.get('y', 0))
            width = float(elem.get('width', 0))
            height = float(elem.get('height', 0))
            fill = elem.get('fill', '#000000')
            rx = float(elem.get('rx', 0))

            # Convert hex color to RGB
            if fill.startswith('#'):
                fill_rgb = tuple(int(fill[i:i+2], 16) for i in (1, 3, 5))
            else:
                fill_rgb = (0, 0, 0)  # Default to black

            if rx > 0:
                # Rounded rectangle approximation
                draw.rectangle([x, y, x+width, y+height], fill=fill_rgb, outline=None)
            else:
                draw.rectangle([x, y, x+width, y+height], fill=fill_rgb)

        elif elem.tag == 'path':
            # Path
            d = elem.get('d', '')
            fill = elem.get('fill', '#000000')

            # Convert hex color to RGB
            if fill.startswith('#'):
                fill_rgb = tuple(int(fill[i:i+2], 16) for i in (1, 3, 5))
            else:
                fill_rgb = (0, 0, 0)

            commands = parse_svg_path(d)
            draw_svg_path(draw, commands, fill_rgb)

        elif elem.tag == 'circle':
            # Circle
            cx = float(elem.get('cx', 0))
            cy = float(elem.get('cy', 0))
            r = float(elem.get('r', 0))
            fill = elem.get('fill', '#000000')
            opacity = float(elem.get('opacity', 1.0))

            # Convert hex color to RGB with opacity
            if fill.startswith('#'):
                fill_rgb = tuple(int(fill[i:i+2], 16) for i in (1, 3, 5))
                fill_rgb = fill_rgb + (int(opacity * 255),)
            else:
                fill_rgb = (0, 0, 0, int(opacity * 255))

            draw.ellipse([cx-r, cy-r, cx+r, cy+r], fill=fill_rgb)

    # Save as PNG
    img.save(png_path, 'PNG')
    print(f"Successfully converted {svg_path} to {png_path}")
    return True

if __name__ == "__main__":
    # Convert icon128.svg to icon128.png
    svg_to_png_simple("icon128.svg", "icon128.png")