"""
Image Watermark Remover
Remove watermarks from images using OpenCV inpainting.
"""

import cv2
import numpy as np
from PIL import Image
import os


def remove_watermark(input_path, output_path, mask_path=None):
    """
    Remove watermark from an image.
    
    Args:
        input_path: Path to input image
        output_path: Path to save output image
        mask_path: Path to watermark mask (optional, auto-detect if None)
    """
    # Read the image
    img = cv2.imread(input_path)
    if img is None:
        raise ValueError(f"Could not read image: {input_path}")
    
    # If no mask provided, try to auto-detect watermark
    if mask_path is None:
        mask = _create_watermark_mask(img)
    else:
        mask = cv2.imread(mask_path, cv2.IMREAD_GRAYSCALE)
    
    # Inpainting to fill the removed watermark area
    # Use TELEPHOTO algorithm for better quality
    result = cv2.inpaint(img, mask, 3, cv2.INPAINT_TELEA)
    
    # Save the result
    cv2.imwrite(output_path, result)
    print(f"Saved result to {output_path}")


def _create_watermark_mask(img):
    """
    Auto-detect potential watermark areas.
    This is a simplified detection - for better results, provide a custom mask.
    """
    # Convert to grayscale
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    
    # Threshold to find light regions (common for watermarks)
    _, mask = cv2.threshold(gray, 230, 255, cv2.THRESH_BINARY)
    
    # Clean up the mask
    kernel = np.ones((3, 3), np.uint8)
    mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, kernel)
    mask = cv2.morphologyEx(mask, cv2.MORPH_OPEN, kernel)
    
    return mask


def batch_process(input_dir, output_dir, mask_path=None):
    """
    Process all images in a directory.
    """
    os.makedirs(output_dir, exist_ok=True)
    
    extensions = ('.jpg', '.jpeg', '.png', '.bmp', '.webp')
    for filename in os.listdir(input_dir):
        if filename.lower().endswith(extensions):
            input_path = os.path.join(input_dir, filename)
            output_path = os.path.join(output_dir, filename)
            try:
                remove_watermark(input_path, output_path, mask_path)
            except Exception as e:
                print(f"Error processing {filename}: {e}")


if __name__ == "__main__":
    import argparse
    
    parser = argparse.ArgumentParser(description="Remove watermarks from images")
    parser.add_argument("input", help="Input image path or directory")
    parser.add_argument("output", help="Output image path or directory")
    parser.add_argument("--mask", "-m", help="Watermark mask image path")
    parser.add_argument("--batch", "-b", action="store_true", help="Batch process directory")
    
    args = parser.parse_args()
    
    if args.batch:
        batch_process(args.input, args.output, args.mask)
    else:
        remove_watermark(args.input, args.output, args.mask)
