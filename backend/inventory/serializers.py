from rest_framework import serializers

from .models import Category, Item


class CategorySerializer(serializers.ModelSerializer):
    class Meta:
        model = Category
        fields = ["id", "name", "slug", "sort_order"]


class ItemSerializer(serializers.ModelSerializer):
    category = CategorySerializer(read_only=True)
    image_url = serializers.SerializerMethodField()

    class Meta:
        model = Item
        fields = [
            "id",
            "name",
            "category",
            "points",
            "availability",
            "image_url",
            "description",
            "updated_at",
        ]

    def get_image_url(self, obj):
        if not obj.image:
            return None
        # Relative URL so the Vite proxy can serve /media during development.
        return obj.image.url


class StaffItemSerializer(ItemSerializer):
    source_image_url = serializers.SerializerMethodField()

    class Meta(ItemSerializer.Meta):
        fields = [
            *ItemSerializer.Meta.fields,
            "is_active",
            "source_image_url",
            "crop_box",
        ]

    def get_source_image_url(self, obj):
        if obj.source_image:
            return obj.source_image.url
        capture = getattr(obj, "source_capture", None)
        if capture is not None and capture.image:
            return capture.image.url
        return None
