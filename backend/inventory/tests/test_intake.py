from io import BytesIO
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.core.files.base import ContentFile
from django.core.files.uploadedfile import SimpleUploadedFile
from PIL import Image
from rest_framework.test import APITestCase

from inventory.gemini import GeminiNotConfigured
from inventory.imaging import MAX_IMAGE_BYTES
from inventory.intake import IntakeError, create_intake
from inventory.models import Category, Item, ShelfCapture


def jpeg_upload(name="shelf.jpg", size=(400, 300)) -> SimpleUploadedFile:
    buffer = BytesIO()
    Image.new("RGB", size, "white").save(buffer, format="JPEG")
    return SimpleUploadedFile(name, buffer.getvalue(), content_type="image/jpeg")


class IntakeApiTests(APITestCase):
    def setUp(self):
        user_model = get_user_model()
        self.staff = user_model.objects.create_user(
            "volunteer",
            password="shelf-pass",
            is_staff=True,
        )
        self.student = user_model.objects.create_user("student", password="student-pass")
        self.produce = Category.objects.create(name="Produce", slug="produce", sort_order=1)
        self.bananas = Item.objects.create(
            name="Bananas",
            category=self.produce,
            points=2,
            availability=Item.Availability.HIGH,
            description="Ripe bananas.",
        )

    def _staff(self):
        self.client.force_authenticate(self.staff)

    def test_token_login_rejects_non_staff(self):
        response = self.client.post(
            "/api/auth/token/",
            {"username": "student", "password": "student-pass"},
            format="json",
        )
        self.assertEqual(response.status_code, 401)

    def test_token_login_returns_a_token_for_staff(self):
        response = self.client.post(
            "/api/auth/token/",
            {"username": "volunteer", "password": "shelf-pass"},
            format="json",
        )
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.data["token"])

    def test_intake_requires_staff(self):
        response = self.client.post("/api/intake/", {"image": jpeg_upload()}, format="multipart")
        self.assertEqual(response.status_code, 401)
        self.client.force_authenticate(self.student)
        response = self.client.post("/api/intake/", {"image": jpeg_upload()}, format="multipart")
        self.assertEqual(response.status_code, 403)

    @patch("inventory.intake.identify_products")
    def test_intake_suggests_an_update_for_an_existing_item(self, identify_products):
        identify_products.return_value = [
            {
                "name": "Bananas",
                "category_slug": "produce",
                "description": "A bunch of yellow bananas.",
                "availability_guess": "low",
                "box_2d": [100, 100, 800, 800],
            },
            {
                "name": "Bananas",
                "category_slug": "produce",
                "description": "Another bunch.",
                "availability_guess": "high",
                "box_2d": [100, 100, 500, 500],
            },
        ]
        self._staff()
        response = self.client.post(
            "/api/intake/",
            {"image": jpeg_upload()},
            format="multipart",
        )
        self.assertEqual(response.status_code, 201, response.data)
        suggestions = response.data["suggestions"]
        self.assertEqual(len(suggestions), 2)
        self.assertEqual(suggestions[0]["action"], "update")
        self.assertEqual(suggestions[0]["match"]["id"], self.bananas.pk)
        self.assertEqual(suggestions[0]["match"]["points"], 2)
        self.assertEqual(suggestions[1]["action"], "create")
        self.assertTrue(suggestions[0]["preview_url"].startswith("/media/"))

    @patch(
        "inventory.intake.identify_products",
        side_effect=GeminiNotConfigured(
            "Photo identification is not configured. Add GEMINI_API_KEY to the server environment."
        ),
    )
    def test_missing_gemini_key_is_a_clear_error(self, _identify):
        self._staff()
        response = self.client.post(
            "/api/intake/",
            {"image": jpeg_upload()},
            format="multipart",
        )
        self.assertEqual(response.status_code, 503)
        self.assertIn("GEMINI_API_KEY", response.data["detail"])

    def test_confirm_updates_and_creates_catalog_items(self):
        self._staff()
        capture = ShelfCapture(created_by=self.staff, detections=[])
        capture.image.save("shelf.jpg", ContentFile(jpeg_upload().read()), save=True)
        response = self.client.post(
            f"/api/intake/{capture.pk}/confirm/",
            {
                "items": [
                    {
                        "action": "update",
                        "item_id": self.bananas.pk,
                        "name": "Bananas",
                        "category_id": self.produce.pk,
                        "points": 2,
                        "availability": "low",
                        "description": "Updated from the shelf photo.",
                        "box_2d": [50, 50, 600, 700],
                    },
                    {
                        "action": "create",
                        "name": "Rolled oats",
                        "category_id": self.produce.pk,
                        "points": 3,
                        "availability": "high",
                        "description": "A canister of oats.",
                        "box_2d": [200, 100, 900, 500],
                    },
                ]
            },
            format="json",
        )
        self.assertEqual(response.status_code, 200, response.data)
        self.bananas.refresh_from_db()
        self.assertEqual(self.bananas.availability, "low")
        self.assertEqual(self.bananas.description, "Updated from the shelf photo.")
        self.assertTrue(self.bananas.image)
        self.assertEqual(self.bananas.source_capture_id, capture.pk)
        self.assertEqual(self.bananas.crop_box, [30, 30, 620, 720])
        oats = Item.objects.get(name="Rolled oats")
        self.assertEqual(oats.points, 3)
        self.assertTrue(oats.image)
        self.assertEqual(oats.source_capture_id, capture.pk)
        catalog = self.client.get("/api/items/")
        names = {item["name"]: item["image_url"] for item in catalog.data}
        self.assertTrue(names["Bananas"])
        self.assertTrue(names["Rolled oats"])

        again = self.client.post(
            f"/api/intake/{capture.pk}/confirm/",
            {"items": []},
            format="json",
        )
        self.assertEqual(again.status_code, 409)

    def test_confirm_rejects_a_second_update_of_the_same_item(self):
        self._staff()
        capture = ShelfCapture(created_by=self.staff, detections=[])
        capture.image.save("shelf.jpg", ContentFile(jpeg_upload().read()), save=True)
        response = self.client.post(
            f"/api/intake/{capture.pk}/confirm/",
            {
                "items": [
                    _row("update", self.bananas.pk, self.produce.pk),
                    _row("update", self.bananas.pk, self.produce.pk, name="Bananas again"),
                ]
            },
            format="json",
        )
        self.assertEqual(response.status_code, 400)
        capture.refresh_from_db()
        self.assertEqual(capture.status, ShelfCapture.Status.PENDING)

    def test_confirm_requires_points_for_a_new_item(self):
        self._staff()
        capture = ShelfCapture(created_by=self.staff, detections=[])
        capture.image.save("shelf.jpg", ContentFile(jpeg_upload().read()), save=True)
        row = _row("create", None, self.produce.pk, name="Pasta")
        row["points"] = ""
        response = self.client.post(
            f"/api/intake/{capture.pk}/confirm/",
            {"items": [row]},
            format="json",
        )
        self.assertEqual(response.status_code, 400)
        self.assertFalse(Item.objects.filter(name="Pasta").exists())


class CreateIntakeGuardTests(APITestCase):
    def setUp(self):
        self.staff = get_user_model().objects.create_user(
            "volunteer",
            password="shelf-pass",
            is_staff=True,
        )

    def test_rejects_an_oversized_photo(self):
        class Huge:
            size = MAX_IMAGE_BYTES + 1

        with self.assertRaises(IntakeError) as raised:
            create_intake(self.staff, Huge())
        self.assertEqual(raised.exception.status, 400)


def _row(action, item_id, category_id, name="Bananas"):
    payload = {
        "action": action,
        "name": name,
        "category_id": category_id,
        "points": 2,
        "availability": "high",
        "description": "From the shelf.",
        "box_2d": [40, 40, 400, 400],
    }
    if item_id is not None:
        payload["item_id"] = item_id
    return payload
