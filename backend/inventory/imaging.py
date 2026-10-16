from io import BytesIO

from PIL import Image, ImageOps

BOX_SCALE = 1000
BOX_PAD = 20
MIN_SPAN = 15
MAX_IMAGE_BYTES = 10 * 1024 * 1024
GEMINI_MAX_SIDE = 1600
CATALOG_MAX_SIDE = 1200


class InvalidImage(Exception):
    pass


def load_uploaded_image(uploaded) -> Image.Image:
    try:
        image = Image.open(uploaded)
        image = ImageOps.exif_transpose(image)
        return image.convert("RGB")
    except Exception as exc:
        raise InvalidImage("Upload a JPEG, PNG, or WEBP photo.") from exc


def pil_to_jpeg_bytes(image: Image.Image, quality: int = 85) -> bytes:
    buffer = BytesIO()
    image.save(buffer, format="JPEG", quality=quality)
    return buffer.getvalue()


def resize_for_gemini(image: Image.Image) -> bytes:
    copy = image.copy()
    copy.thumbnail((GEMINI_MAX_SIDE, GEMINI_MAX_SIDE), Image.Resampling.LANCZOS)
    return pil_to_jpeg_bytes(copy)


def normalize_box(box) -> tuple[int, int, int, int] | None:
    """Clamp a Gemini box to the 0–1000 grid.

    `box` is [ymin, xmin, ymax, xmax]. Boxes that are not a rectangle of at
    least MIN_SPAN on each side are rejected. Padding is applied later, at
    crop time, so a stored box can be cropped once.
    """
    if not isinstance(box, (list, tuple)) or len(box) != 4:
        return None
    try:
        ymin, xmin, ymax, xmax = (int(round(float(value))) for value in box)
    except (TypeError, ValueError):
        return None
    ymin = max(0, min(BOX_SCALE, ymin))
    xmin = max(0, min(BOX_SCALE, xmin))
    ymax = max(0, min(BOX_SCALE, ymax))
    xmax = max(0, min(BOX_SCALE, xmax))
    if ymax - ymin < MIN_SPAN or xmax - xmin < MIN_SPAN:
        return None
    return (ymin, xmin, ymax, xmax)


def pad_box(box: tuple[int, int, int, int]) -> tuple[int, int, int, int]:
    ymin, xmin, ymax, xmax = box
    return (
        max(0, ymin - BOX_PAD),
        max(0, xmin - BOX_PAD),
        min(BOX_SCALE, ymax + BOX_PAD),
        min(BOX_SCALE, xmax + BOX_PAD),
    )


def crop_image(image: Image.Image, box, *, pad: bool = True) -> Image.Image | None:
    normalized = normalize_box(box)
    if normalized is None:
        return None
    ymin, xmin, ymax, xmax = pad_box(normalized) if pad else normalized
    width, height = image.size
    if width < 1 or height < 1:
        return None
    left = round(xmin / BOX_SCALE * width)
    top = round(ymin / BOX_SCALE * height)
    right = round(xmax / BOX_SCALE * width)
    bottom = round(ymax / BOX_SCALE * height)
    left = max(0, min(left, width - 1))
    top = max(0, min(top, height - 1))
    right = max(left + 1, min(right, width))
    bottom = max(top + 1, min(bottom, height))
    cropped = image.crop((left, top, right, bottom))
    cropped.thumbnail((CATALOG_MAX_SIDE, CATALOG_MAX_SIDE), Image.Resampling.LANCZOS)
    return cropped


def crop_to_jpeg(image: Image.Image, box, *, pad: bool = True) -> bytes | None:
    cropped = crop_image(image, box, pad=pad)
    if cropped is None:
        return None
    return pil_to_jpeg_bytes(cropped)
