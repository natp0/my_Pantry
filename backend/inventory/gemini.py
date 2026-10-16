import json
import logging

from django.conf import settings

from .imaging import normalize_box

logger = logging.getLogger(__name__)

MAX_DETECTIONS = 24
VALID_AVAILABILITY = {"high", "low", "out"}

RESPONSE_SCHEMA = {
    "type": "object",
    "properties": {
        "items": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "name": {"type": "string"},
                    "category_slug": {"type": "string"},
                    "description": {"type": "string"},
                    "availability_guess": {
                        "type": "string",
                        "enum": ["high", "low", "out"],
                    },
                    "box_2d": {
                        "type": "array",
                        "items": {"type": "integer"},
                        "minItems": 4,
                        "maxItems": 4,
                    },
                },
                "required": [
                    "name",
                    "category_slug",
                    "description",
                    "availability_guess",
                    "box_2d",
                ],
            },
        }
    },
    "required": ["items"],
}


class GeminiNotConfigured(Exception):
    pass


class GeminiIdentificationError(Exception):
    pass


def parse_detections(payload, valid_slugs: set[str]) -> list[dict]:
    if isinstance(payload, str):
        payload = json.loads(payload)
    if isinstance(payload, list):
        items = payload
    elif isinstance(payload, dict):
        items = payload.get("items", [])
    else:
        raise GeminiIdentificationError(
            "Photo identification returned an unreadable result. Try the photo again."
        )
    if not isinstance(items, list):
        raise GeminiIdentificationError(
            "Photo identification returned an unreadable result. Try the photo again."
        )

    detections = []
    for item in items:
        if len(detections) >= MAX_DETECTIONS:
            break
        if not isinstance(item, dict):
            continue
        name = str(item.get("name", "")).strip()
        box = normalize_box(item.get("box_2d", item.get("box")))
        if not name or box is None:
            continue
        slug = str(item.get("category_slug", "")).strip().lower()
        availability = str(item.get("availability_guess", "")).strip().lower()
        if availability not in VALID_AVAILABILITY:
            availability = "high"
        detections.append(
            {
                "name": name[:200],
                "category_slug": slug if slug in valid_slugs else "",
                "description": str(item.get("description", "")).strip()[:2000],
                "availability_guess": availability,
                "box_2d": list(box),
            }
        )
    return detections


def identify_products(
    image_bytes: bytes,
    mime_type: str,
    categories: list[tuple[str, str]],
) -> list[dict]:
    api_key = settings.GEMINI_API_KEY
    if not api_key:
        raise GeminiNotConfigured(
            "Photo identification is not configured. Add GEMINI_API_KEY to the server environment."
        )

    from google import genai
    from google.genai import types

    category_lines = "\n".join(f"- {slug}: {name}" for slug, name in categories)
    prompt = (
        "You are cataloging products on a food pantry shelf.\n"
        "List each distinct food, drink, personal-care, or household product you can see.\n"
        "Skip empty shelf, price tags, and products you cannot actually see.\n"
        "Use a short catalog name such as \"Bananas\" or \"Canned black beans\".\n"
        "category_slug must be exactly one of these slugs:\n"
        f"{category_lines}\n"
        "description is one sentence a student would understand.\n"
        "availability_guess is \"high\" when the product looks well stocked, "
        "\"low\" when only a few are left, or \"out\" when the spot looks empty.\n"
        "box_2d is [ymin, xmin, ymax, xmax], integers from 0 to 1000, "
        "covering that product in the image. 0 is the top or left edge and 1000 is the bottom or right edge."
    )

    client = genai.Client(
        api_key=api_key,
        http_options=types.HttpOptions(timeout=60_000),
    )
    try:
        response = client.models.generate_content(
            model=settings.GEMINI_MODEL,
            contents=[
                types.Part.from_bytes(data=image_bytes, mime_type=mime_type),
                prompt,
            ],
            config=types.GenerateContentConfig(
                temperature=0.2,
                response_mime_type="application/json",
                response_json_schema=RESPONSE_SCHEMA,
            ),
        )
        payload = json.loads(response.text or "")
    except GeminiIdentificationError:
        raise
    except Exception as exc:
        logger.exception("Gemini shelf identification failed")
        raise GeminiIdentificationError(
            "Photo identification failed. Check the connection and try again."
        ) from exc

    return parse_detections(payload, {slug for slug, _name in categories})
