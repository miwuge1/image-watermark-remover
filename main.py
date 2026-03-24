#!/usr/bin/env python3
"""
Image Watermark Remover - CLI Entry Point
"""

from watermark_remover import remove_watermark, batch_process
import sys

def main():
    if len(sys.argv) < 3:
        print("Usage:")
        print("  Single image: python main.py input.jpg output.jpg")
        print("  Batch mode:   python main.py input_dir output_dir --batch")
        sys.exit(1)
    
    input_path = sys.argv[1]
    output_path = sys.argv[2]
    batch_mode = "--batch" in sys.argv or "-b" in sys.argv
    
    # Get mask path if provided
    mask_path = None
    if "--mask" in sys.argv:
        idx = sys.argv.index("--mask")
        mask_path = sys.argv[idx + 1]
    elif "-m" in sys.argv:
        idx = sys.argv.index("-m")
        mask_path = sys.argv[idx + 1]
    
    if batch_mode:
        batch_process(input_path, output_path, mask_path)
    else:
        remove_watermark(input_path, output_path, mask_path)

if __name__ == "__main__":
    main()
