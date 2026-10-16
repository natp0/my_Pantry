from django.conf import settings
from django.db import models
from django.utils.text import slugify


class Category(models.Model):
    name = models.CharField(max_length=100)
    slug = models.SlugField(unique=True, max_length=120)
    sort_order = models.PositiveIntegerField(default=0)

    class Meta:
        ordering = ["sort_order", "name"]
        verbose_name_plural = "categories"

    def __str__(self):
        return self.name

    def save(self, *args, **kwargs):
        if not self.slug:
            self.slug = slugify(self.name)
        super().save(*args, **kwargs)


class Item(models.Model):
    class Availability(models.TextChoices):
        HIGH = "high", "High"
        LOW = "low", "Low"
        OUT = "out", "Out of stock"

    name = models.CharField(max_length=200)
    category = models.ForeignKey(
        Category, on_delete=models.CASCADE, related_name="items"
    )
    points = models.PositiveIntegerField()
    availability = models.CharField(
        max_length=10,
        choices=Availability.choices,
        default=Availability.HIGH,
    )
    image = models.ImageField(upload_to="items/", blank=True, null=True)
    source_image = models.ImageField(upload_to="item-sources/", blank=True, null=True)
    source_capture = models.ForeignKey(
        "ShelfCapture",
        on_delete=models.SET_NULL,
        related_name="sourced_items",
        blank=True,
        null=True,
    )
    crop_box = models.JSONField(blank=True, null=True)
    description = models.TextField(blank=True)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["name"]

    def __str__(self):
        return self.name


class ShelfCapture(models.Model):
    class Status(models.TextChoices):
        PENDING = "pending", "Pending"
        CONFIRMED = "confirmed", "Confirmed"

    image = models.ImageField(upload_to="shelves/")
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="shelf_captures",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    status = models.CharField(
        max_length=20,
        choices=Status.choices,
        default=Status.PENDING,
    )
    detections = models.JSONField(default=list, blank=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"Shelf photo {self.pk}"
