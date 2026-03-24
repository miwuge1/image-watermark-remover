# Image Watermark Remover

A Python tool to remove watermarks from images using inpainting techniques.

## Features

- Remove text watermarks from images
- Fill removed areas with smart inpainting
- Support batch processing
- CLI and Python API

## Installation

```bash
pip install -r requirements.txt
```

## Usage

### CLI

```bash
python main.py input.jpg output.jpg --mode remove
```

### Python API

```python
from watermark_remover import remove_watermark

remove_watermark("input.jpg", "output.jpg")
```

## Requirements

- Python 3.8+
- OpenCV
- NumPy
- PIL

## License

MIT
