import json
from uuid import uuid4

from django.contrib.auth import authenticate
from django.core.files.base import ContentFile
from rest_framework import generics
from rest_framework.authtoken.models import Token
from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework.permissions import AllowAny, IsAdminUser
from rest_framework.response import Response
from rest_framework.views import APIView

from .imaging import (
    MAX_IMAGE_BYTES,
    InvalidImage,
    crop_to_jpeg,
    load_uploaded_image,
    normalize_box,
    pil_to_jpeg_bytes,
)
from .intake import IntakeError, confirm_intake, create_intake
from .models import Category, Item, ShelfCapture
from .serializers import CategorySerializer, ItemSerializer, StaffItemSerializer


class CategoryListView(generics.ListAPIView):
    queryset = Category.objects.all()
    serializer_class = CategorySerializer


class ItemListView(generics.ListAPIView):
    serializer_class = ItemSerializer

    def get_queryset(self):
        queryset = Item.objects.filter(is_active=True).select_related("category")
        category_slug = self.request.query_params.get("category")
        if category_slug:
            queryset = queryset.filter(category__slug=category_slug)
        return queryset


class StaffTokenView(APIView):
    authentication_classes = []
    permission_classes = [AllowAny]

    def post(self, request):
        username = str(request.data.get("username", "")).strip()
        password = request.data.get("password", "")
        user = authenticate(username=username, password=password)
        if user is None or not user.is_staff:
            return Response({"detail": "Invalid staff credentials."}, status=401)
        token, _created = Token.objects.get_or_create(user=user)
        return Response({"token": token.key, "username": user.get_username()})


class IntakeView(APIView):
    permission_classes = [IsAdminUser]
    parser_classes = [MultiPartParser, FormParser]

    def post(self, request):
        try:
            payload = create_intake(request.user, request.FILES.get("image"))
        except IntakeError as exc:
            return Response({"detail": exc.detail}, status=exc.status)
        return Response(payload, status=201)


class IntakeConfirmView(APIView):
    permission_classes = [IsAdminUser]

    def post(self, request, pk):
        try:
            capture = ShelfCapture.objects.get(pk=pk)
        except ShelfCapture.DoesNotExist:
            return Response({"detail": "That photo could not be found."}, status=404)
        try:
            saved = confirm_intake(capture, request.data.get("items"))
        except IntakeError as exc:
            return Response({"detail": exc.detail}, status=exc.status)
        return Response({"saved": saved})


class StaffItemListView(APIView):
    permission_classes = [IsAdminUser]

    def get(self, request):
        items = Item.objects.select_related("category", "source_capture").all()
        return Response(StaffItemSerializer(items, many=True).data)


class StaffItemUpdateView(APIView):
    permission_classes = [IsAdminUser]

    def patch(self, request, pk):
        try:
            item = Item.objects.select_related("category", "source_capture").get(pk=pk)
        except Item.DoesNotExist:
            return Response({"detail": "That catalog item could not be found."}, status=404)
        fields, error = _staff_item_fields(request.data)
        if error:
            return Response({"detail": error}, status=400)
        prepared, photo_error = _prepared_photo(
            item,
            request.FILES.get("image"),
            request.data.get("box_2d"),
        )
        if photo_error:
            return Response({"detail": photo_error}, status=400)
        for name, value in fields.items():
            setattr(item, name, value)
        if prepared is not None:
            if prepared["source_bytes"] is not None:
                if item.source_image:
                    item.source_image.delete(save=False)
                item.source_capture = None
                item.source_image.save(
                    f"source-{item.pk}-{uuid4().hex[:8]}.jpg",
                    ContentFile(prepared["source_bytes"]),
                    save=False,
                )
            item.crop_box = prepared["crop_box"]
        item.save()
        if prepared is not None:
            if item.image:
                item.image.delete(save=False)
            item.image.save(
                f"edit-{item.pk}-{uuid4().hex[:8]}.jpg",
                ContentFile(prepared["jpeg"]),
                save=True,
            )
        item.refresh_from_db()
        return Response(StaffItemSerializer(item).data)


def _staff_item_fields(data):
    if not isinstance(data, dict):
        return None, "Send the item details to save."
    name = str(data.get("name", "")).strip()[:200]
    if not name:
        return None, "Enter a name."
    availability = str(data.get("availability", "")).strip()
    if availability not in Item.Availability.values:
        return None, "Choose an availability."
    category_id = data.get("category_id")
    if isinstance(category_id, str) and category_id.strip().isdigit():
        category_id = int(category_id.strip())
    if isinstance(category_id, bool) or not isinstance(category_id, int):
        return None, "Choose a category."
    if not Category.objects.filter(pk=category_id).exists():
        return None, "That category does not exist."
    points = data.get("points")
    if isinstance(points, str) and points.strip().isdigit():
        points = int(points.strip())
    if isinstance(points, float) and points.is_integer():
        points = int(points)
    if isinstance(points, bool) or not isinstance(points, int) or points < 0:
        return None, "Enter a point value of 0 or more."
    is_active = _parse_bool(data.get("is_active"))
    if is_active is None:
        return None, "Choose whether students can see this item."
    return {
        "name": name,
        "category_id": category_id,
        "points": points,
        "availability": availability,
        "description": str(data.get("description", "")).strip()[:2000],
        "is_active": is_active,
    }, None


def _parse_bool(value):
    if isinstance(value, bool):
        return value
    if isinstance(value, str):
        lowered = value.strip().lower()
        if lowered in {"true", "1", "yes", "on"}:
            return True
        if lowered in {"false", "0", "no", "off"}:
            return False
    return None


def _prepared_photo(item, uploaded, raw_box):
    """Crop a catalog photo from the original, keeping that original for later edits."""
    box, box_error = _parse_box(raw_box)
    if box_error:
        return None, box_error
    if uploaded is None and box is None:
        return None, None
    source_bytes = None
    if uploaded is not None:
        size = getattr(uploaded, "size", None)
        if size is not None and size > MAX_IMAGE_BYTES:
            return None, "That photo is larger than 10MB. Try a smaller one."
        try:
            image = load_uploaded_image(uploaded)
        except InvalidImage as exc:
            return None, str(exc)
        source_bytes = pil_to_jpeg_bytes(image, quality=90)
        if box is None:
            box = [0, 0, 1000, 1000]
    else:
        image, error = _open_original(item)
        if error:
            return None, error
    normalized = normalize_box(box)
    if normalized is None:
        return None, "That crop is too small."
    jpeg = crop_to_jpeg(image, normalized, pad=False)
    if jpeg is None:
        return None, "That crop is too small."
    return {
        "jpeg": jpeg,
        "crop_box": list(normalized),
        "source_bytes": source_bytes,
    }, None


def _open_original(item):
    field = item.source_image if item.source_image else None
    if field is None and item.source_capture_id and item.source_capture.image:
        field = item.source_capture.image
    if field is None:
        field = item.image
    if not field:
        return None, "This item has no photo to crop. Upload one instead."
    with field.open("rb") as handle:
        try:
            return load_uploaded_image(handle), None
        except InvalidImage:
            return None, "The current photo could not be opened."


def _parse_box(raw_box):
    if raw_box is None or raw_box == "":
        return None, None
    if isinstance(raw_box, str):
        try:
            raw_box = json.loads(raw_box)
        except json.JSONDecodeError:
            return None, "That crop could not be read."
    if not isinstance(raw_box, (list, tuple)) or len(raw_box) != 4:
        return None, "That crop could not be read."
    return list(raw_box), None
