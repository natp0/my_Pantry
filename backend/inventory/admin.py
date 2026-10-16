from django.contrib import admin
from django.utils.html import format_html

from .models import Category, Item


@admin.register(Category)
class CategoryAdmin(admin.ModelAdmin):
    list_display = ("name", "slug", "sort_order")
    prepopulated_fields = {"slug": ("name",)}
    search_fields = ("name",)
    ordering = ("sort_order", "name")


@admin.register(Item)
class ItemAdmin(admin.ModelAdmin):
    list_display = (
        "image_preview",
        "name",
        "category",
        "points",
        "availability",
        "is_active",
        "updated_at",
    )
    list_display_links = ("image_preview", "name")
    list_filter = ("availability", "category", "is_active")
    search_fields = ("name", "description")
    list_editable = ("availability", "points", "is_active")
    readonly_fields = ("image_preview",)
    fields = (
        "name",
        "category",
        "points",
        "availability",
        "image",
        "image_preview",
        "description",
        "is_active",
    )

    @admin.display(description="Photo")
    def image_preview(self, obj):
        if obj.image:
            return format_html(
                '<img src="{}" alt="" style="max-height: 64px; max-width: 64px; '
                'object-fit: cover; border-radius: 4px;" />',
                obj.image.url,
            )
        return "—"
