from io import BytesIO

from django.contrib.auth import get_user_model
from django.core.files.base import ContentFile
from django.core.files.uploadedfile import SimpleUploadedFile
from PIL import Image
from rest_framework.test import APITestCase

from inventory.models import Category, Item, ShelfCapture


class StaffItemEditTests(APITestCase):
    def setUp(self):
        user_model = get_user_model()
        self.staff = user_model.objects.create_user(
            "volunteer",
            password="shelf-pass",
            is_staff=True,
        )
        self.student = user_model.objects.create_user("student", password="student-pass")
        self.produce = Category.objects.create(name="Produce", slug="produce", sort_order=1)
        self.snacks = Category.objects.create(name="Snacks", slug="snacks", sort_order=2)
        self.bananas = Item.objects.create(
            name="Bananas",
            category=self.produce,
            points=2,
            availability=Item.Availability.HIGH,
            description="Ripe bananas.",
        )
        Item.objects.create(
            name="Hidden oats",
            category=self.produce,
            points=1,
            availability=Item.Availability.OUT,
            description="Not on the student catalog.",
            is_active=False,
        )

    def test_students_cannot_edit_items(self):
        response = self.client.patch(
            f"/api/staff/items/{self.bananas.pk}/",
            {"name": "Plantains"},
            format="json",
        )
        self.assertEqual(response.status_code, 401)
        self.client.force_authenticate(self.student)
        response = self.client.patch(
            f"/api/staff/items/{self.bananas.pk}/",
            {"name": "Plantains"},
            format="json",
        )
        self.assertEqual(response.status_code, 403)

    def test_staff_can_edit_an_existing_item(self):
        self.client.force_authenticate(self.staff)
        listed = self.client.get("/api/staff/items/")
        self.assertEqual(listed.status_code, 200)
        names = {item["name"] for item in listed.data}
        self.assertIn("Hidden oats", names)
        self.assertIn("Bananas", names)

        response = self.client.patch(
            f"/api/staff/items/{self.bananas.pk}/",
            {
                "name": "Ripe bananas",
                "category_id": self.snacks.pk,
                "points": 4,
                "availability": "low",
                "description": "A smaller bunch.",
                "is_active": True,
            },
            format="json",
        )
        self.assertEqual(response.status_code, 200, response.data)
        self.bananas.refresh_from_db()
        self.assertEqual(self.bananas.name, "Ripe bananas")
        self.assertEqual(self.bananas.category_id, self.snacks.pk)
        self.assertEqual(self.bananas.points, 4)
        self.assertEqual(self.bananas.availability, "low")
        self.assertEqual(self.bananas.description, "A smaller bunch.")

        catalog = self.client.get("/api/items/")
        match = next(item for item in catalog.data if item["id"] == self.bananas.pk)
        self.assertEqual(match["name"], "Ripe bananas")
        self.assertEqual(match["points"], 4)
        self.assertNotIn("is_active", match)

    def test_hiding_an_item_removes_it_from_the_student_catalog(self):
        self.client.force_authenticate(self.staff)
        response = self.client.patch(
            f"/api/staff/items/{self.bananas.pk}/",
            {
                "name": "Bananas",
                "category_id": self.produce.pk,
                "points": 2,
                "availability": "high",
                "description": "Ripe bananas.",
                "is_active": False,
            },
            format="json",
        )
        self.assertEqual(response.status_code, 200, response.data)
        catalog = self.client.get("/api/items/")
        self.assertNotIn(self.bananas.pk, [item["id"] for item in catalog.data])

    def test_edit_requires_a_name_and_points(self):
        self.client.force_authenticate(self.staff)
        response = self.client.patch(
            f"/api/staff/items/{self.bananas.pk}/",
            {
                "name": "  ",
                "category_id": self.produce.pk,
                "points": "",
                "availability": "high",
                "description": "",
                "is_active": True,
            },
            format="json",
        )
        self.assertEqual(response.status_code, 400)
        self.bananas.refresh_from_db()
        self.assertEqual(self.bananas.name, "Bananas")

    def test_staff_can_recrop_the_current_photo(self):
        self.bananas.image.save("bananas.jpg", ContentFile(_jpeg(100, 80)), save=True)
        self.client.force_authenticate(self.staff)
        response = self.client.patch(
            f"/api/staff/items/{self.bananas.pk}/",
            {**_fields(self.produce.pk), "box_2d": [0, 0, 500, 1000]},
            format="json",
        )
        self.assertEqual(response.status_code, 200, response.data)
        self.bananas.refresh_from_db()
        with self.bananas.image.open("rb") as handle:
            cropped = Image.open(handle)
            cropped.load()
        self.assertEqual(cropped.size, (100, 40))
        self.assertTrue(response.data["image_url"])

    def test_staff_can_upload_and_crop_a_new_photo(self):
        self.client.force_authenticate(self.staff)
        payload = _fields(self.produce.pk)
        payload["is_active"] = "true"
        payload["box_2d"] = "[0, 0, 1000, 500]"
        payload["image"] = SimpleUploadedFile(
            "replacement.jpg",
            _jpeg(80, 60),
            content_type="image/jpeg",
        )
        response = self.client.patch(
            f"/api/staff/items/{self.bananas.pk}/",
            payload,
            format="multipart",
        )
        self.assertEqual(response.status_code, 200, response.data)
        self.bananas.refresh_from_db()
        with self.bananas.image.open("rb") as handle:
            cropped = Image.open(handle)
            cropped.load()
        self.assertEqual(cropped.size, (40, 60))
        self.assertTrue(self.bananas.source_image)
        with self.bananas.source_image.open("rb") as handle:
            original = Image.open(handle)
            original.load()
        self.assertEqual(original.size, (80, 60))
        self.assertIsNone(self.bananas.source_capture_id)
        self.assertEqual(self.bananas.crop_box, [0, 0, 1000, 500])

    def test_recrop_can_widen_back_to_the_original_photo(self):
        self.bananas.source_image.save("source.jpg", ContentFile(_jpeg(100, 80)), save=True)
        self.bananas.image.save("thumb.jpg", ContentFile(_jpeg(20, 20)), save=True)
        self.bananas.crop_box = [0, 0, 500, 500]
        self.bananas.save(update_fields=["crop_box"])
        self.client.force_authenticate(self.staff)
        response = self.client.patch(
            f"/api/staff/items/{self.bananas.pk}/",
            {**_fields(self.produce.pk), "box_2d": [0, 0, 1000, 1000]},
            format="json",
        )
        self.assertEqual(response.status_code, 200, response.data)
        self.bananas.refresh_from_db()
        with self.bananas.image.open("rb") as handle:
            cropped = Image.open(handle)
            cropped.load()
        self.assertEqual(cropped.size, (100, 80))
        with self.bananas.source_image.open("rb") as handle:
            original = Image.open(handle)
            original.load()
        self.assertEqual(original.size, (100, 80))
        self.assertEqual(response.data["crop_box"], [0, 0, 1000, 1000])
        self.assertTrue(response.data["source_image_url"])
        catalog = self.client.get("/api/items/")
        match = next(item for item in catalog.data if item["id"] == self.bananas.pk)
        self.assertNotIn("source_image_url", match)

    def test_recrop_uses_the_shelf_photo_when_that_is_the_original(self):
        capture = ShelfCapture(created_by=self.staff, detections=[])
        capture.image.save("shelf.jpg", ContentFile(_jpeg(100, 80)), save=True)
        self.bananas.source_capture = capture
        self.bananas.crop_box = [0, 0, 1000, 500]
        self.bananas.image.save("thumb.jpg", ContentFile(_jpeg(10, 10)), save=True)
        self.bananas.save(update_fields=["source_capture", "crop_box"])
        self.client.force_authenticate(self.staff)
        response = self.client.patch(
            f"/api/staff/items/{self.bananas.pk}/",
            {**_fields(self.produce.pk), "box_2d": [0, 0, 1000, 1000]},
            format="json",
        )
        self.assertEqual(response.status_code, 200, response.data)
        self.bananas.refresh_from_db()
        with self.bananas.image.open("rb") as handle:
            cropped = Image.open(handle)
            cropped.load()
        self.assertEqual(cropped.size, (100, 80))
        self.assertEqual(self.bananas.source_capture_id, capture.pk)
        self.assertFalse(self.bananas.source_image)

    def test_recrop_without_a_photo_is_rejected(self):
        self.client.force_authenticate(self.staff)
        response = self.client.patch(
            f"/api/staff/items/{self.bananas.pk}/",
            {**_fields(self.produce.pk), "box_2d": [0, 0, 500, 500]},
            format="json",
        )
        self.assertEqual(response.status_code, 400)


def _fields(category_id):
    return {
        "name": "Bananas",
        "category_id": category_id,
        "points": 2,
        "availability": "high",
        "description": "Ripe bananas.",
        "is_active": True,
    }


def _jpeg(width, height) -> bytes:
    buffer = BytesIO()
    Image.new("RGB", (width, height), "red").save(buffer, format="JPEG")
    return buffer.getvalue()
