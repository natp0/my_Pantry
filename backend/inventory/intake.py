from uuid import uuid4

from django.core.files.base import ContentFile
from django.core.files.storage import default_storage
from django.db import transaction

from .gemini import (
    GeminiIdentificationError,
    GeminiNotConfigured,
    identify_products,
)
from .imaging import (
    MAX_IMAGE_BYTES,
    InvalidImage,
    crop_to_jpeg,
    load_uploaded_image,
    normalize_box,
    pad_box,
    pil_to_jpeg_bytes,
    resize_for_gemini,
)
from .matching import find_best_match, initial_actions
from .models import Category, Item, ShelfCapture


class IntakeError(Exception):
    def __init__(self, detail: str, status: int):
        super().__init__(detail)
        self.detail = detail
        self.status = status


def create_intake(user, uploaded) -> dict:
    if uploaded is None:
        raise IntakeError("Choose a photo to identify.", 400)
    size = getattr(uploaded, "size", None)
    if size is not None and size > MAX_IMAGE_BYTES:
        raise IntakeError("That photo is larger than 10MB. Try a smaller one.", 400)

    try:
        image = load_uploaded_image(uploaded)
    except InvalidImage as exc:
        raise IntakeError(str(exc), 400) from exc

    categories = list(Category.objects.all())
    if not categories:
        raise IntakeError("Add categories before identifying photos.", 400)
    categories_by_slug = {category.slug: category for category in categories}

    try:
        detections = identify_products(
            resize_for_gemini(image),
            "image/jpeg",
            [(category.slug, category.name) for category in categories],
        )
    except GeminiNotConfigured as exc:
        raise IntakeError(str(exc), 503) from exc
    except GeminiIdentificationError as exc:
        raise IntakeError(str(exc), 502) from exc

    capture = ShelfCapture(created_by=user, detections=detections)
    capture.image.save(
        f"shelf-{uuid4().hex}.jpg",
        ContentFile(pil_to_jpeg_bytes(image, quality=90)),
        save=True,
    )

    catalog_items = list(Item.objects.filter(is_active=True).select_related("category"))
    visible = []
    for index, detection in enumerate(detections):
        preview = crop_to_jpeg(image, detection["box_2d"])
        if preview is None:
            continue
        found = find_best_match(detection["name"], catalog_items)
        visible.append((index, detection, preview, found[0] if found else None))
    actions = initial_actions(
        [match.pk if match is not None else None for _index, _detection, _preview, match in visible]
    )

    suggestions = []
    for (index, detection, preview, match), action in zip(visible, actions, strict=True):
        preview_path = default_storage.save(
            f"shelves/previews/{capture.pk}/{index}.jpg",
            ContentFile(preview),
        )
        category = categories_by_slug.get(detection["category_slug"])
        suggestions.append(
            {
                "index": index,
                "preview_url": default_storage.url(preview_path),
                "box_2d": detection["box_2d"],
                "detected": {
                    "name": detection["name"],
                    "category_id": category.pk if category else None,
                    "description": detection["description"],
                    "availability": detection["availability_guess"],
                },
                "match": _match_payload(match),
                "action": action,
            }
        )

    detail = None
    if not suggestions:
        detail = (
            "No products were found in that photo. Try a closer or brighter picture."
        )
    payload = {"id": capture.pk, "suggestions": suggestions}
    if detail:
        payload["detail"] = detail
    return payload


def confirm_intake(capture: ShelfCapture, rows) -> list[dict]:
    if not isinstance(rows, list):
        raise IntakeError("Send the items to save.", 400)
    parsed = [_parse_row(row, index) for index, row in enumerate(rows)]
    _reject_duplicate_updates(parsed)

    with capture.image.open("rb") as handle:
        image = load_uploaded_image(handle)

    prepared = []
    for row in parsed:
        if row["action"] == "skip":
            continue
        cropped = crop_to_jpeg(image, row["box_2d"])
        if cropped is None:
            raise IntakeError(
                f"Row {row['number']} does not have a usable crop.",
                400,
            )
        prepared.append((row, cropped))

    saved = []
    with transaction.atomic():
        claimed = ShelfCapture.objects.filter(
            pk=capture.pk,
            status=ShelfCapture.Status.PENDING,
        ).update(status=ShelfCapture.Status.CONFIRMED)
        if not claimed:
            raise IntakeError("This photo was already saved.", 409)
        for row, cropped in prepared:
            item = _write_item(row)
            _attach_image(item, cropped)
            _remember_source(item, capture, row["box_2d"])
            saved.append(
                {"id": item.pk, "name": item.name, "action": row["action"]}
            )
    return saved


def _match_payload(item: Item | None) -> dict | None:
    if item is None:
        return None
    return {
        "id": item.pk,
        "name": item.name,
        "category_id": item.category_id,
        "points": item.points,
        "availability": item.availability,
        "description": item.description,
    }


def _parse_row(row, index: int) -> dict:
    number = index + 1
    if not isinstance(row, dict):
        raise IntakeError(f"Row {number} is invalid.", 400)
    action = row.get("action")
    if action not in {"skip", "update", "create"}:
        raise IntakeError(f"Row {number} has an unknown action.", 400)
    if action == "skip":
        return {"action": "skip", "number": number}

    name = str(row.get("name", "")).strip()[:200]
    if not name:
        raise IntakeError(f"Row {number} needs a name.", 400)

    availability = str(row.get("availability", "")).strip()
    if availability not in Item.Availability.values:
        raise IntakeError(f"Row {number} needs an availability.", 400)

    category_id = _parse_category_id(row.get("category_id"), number)
    points = _parse_points(row.get("points"), number)
    box = row.get("box_2d")
    if not isinstance(box, (list, tuple)) or len(box) != 4:
        raise IntakeError(f"Row {number} is missing a crop.", 400)

    item_id = None
    if action == "update":
        item_id = _parse_item_id(row.get("item_id"), number)

    return {
        "action": action,
        "number": number,
        "name": name,
        "category_id": category_id,
        "points": points,
        "availability": availability,
        "description": str(row.get("description", "")).strip()[:2000],
        "box_2d": box,
        "item_id": item_id,
    }


def _parse_points(value, number: int) -> int:
    if isinstance(value, str) and value.strip().isdigit():
        value = int(value.strip())
    if isinstance(value, float) and value.is_integer():
        value = int(value)
    if isinstance(value, bool) or not isinstance(value, int) or value < 0:
        raise IntakeError(f"Row {number} needs a point value of 0 or more.", 400)
    return value


def _parse_category_id(value, number: int) -> int:
    if isinstance(value, str) and value.strip().isdigit():
        value = int(value.strip())
    if isinstance(value, bool) or not isinstance(value, int):
        raise IntakeError(f"Row {number} needs a category.", 400)
    if not Category.objects.filter(pk=value).exists():
        raise IntakeError(f"Row {number} has a category that does not exist.", 400)
    return value


def _parse_item_id(value, number: int) -> int:
    if isinstance(value, str) and value.strip().isdigit():
        value = int(value.strip())
    if isinstance(value, bool) or not isinstance(value, int):
        raise IntakeError(f"Row {number} is missing the catalog item to update.", 400)
    if not Item.objects.filter(pk=value).exists():
        raise IntakeError(f"Row {number} refers to a catalog item that does not exist.", 400)
    return value


def _reject_duplicate_updates(rows: list[dict]) -> None:
    seen: set[int] = set()
    for row in rows:
        if row["action"] != "update":
            continue
        item_id = row["item_id"]
        if item_id in seen:
            raise IntakeError(
                "Each catalog item can only be updated once from the same photo.",
                400,
            )
        seen.add(item_id)


def _write_item(row: dict) -> Item:
    fields = {
        "name": row["name"],
        "category_id": row["category_id"],
        "points": row["points"],
        "availability": row["availability"],
        "description": row["description"],
    }
    if row["action"] == "update":
        item = Item.objects.get(pk=row["item_id"])
        for field, value in fields.items():
            setattr(item, field, value)
        item.save()
        return item
    return Item.objects.create(**fields)


def _attach_image(item: Item, jpeg_bytes: bytes) -> None:
    if item.image:
        item.image.delete(save=False)
    item.image.save(f"intake-{item.pk}.jpg", ContentFile(jpeg_bytes), save=True)


def _remember_source(item: Item, capture: ShelfCapture, box) -> None:
    """Keep the shelf photo so a later edit can widen the crop."""
    if item.source_image:
        item.source_image.delete(save=False)
        item.source_image = None
    item.source_capture = capture
    normalized = normalize_box(box)
    item.crop_box = list(pad_box(normalized) if normalized else box)
    item.save(update_fields=["source_image", "source_capture", "crop_box"])
