from django.test import SimpleTestCase
from PIL import Image

from inventory.gemini import parse_detections
from inventory.imaging import crop_image, normalize_box


class NormalizeBoxTests(SimpleTestCase):
    def test_clamps_to_the_grid(self):
        self.assertEqual(normalize_box([-20, 10, 1100, 400]), (0, 10, 1000, 400))

    def test_rejects_a_box_that_is_not_a_rectangle(self):
        self.assertIsNone(normalize_box([100, 100, 105, 400]))
        self.assertIsNone(normalize_box([1, 2, 3]))
        self.assertIsNone(normalize_box("nope"))


class CropImageTests(SimpleTestCase):
    def test_pads_the_box_before_cropping(self):
        image = Image.new("RGB", (1000, 1000), "white")
        cropped = crop_image(image, [100, 200, 300, 400])
        self.assertEqual(cropped.size, (240, 240))

    def test_keeps_edge_padding_inside_the_photo(self):
        image = Image.new("RGB", (1000, 1000), "white")
        cropped = crop_image(image, [0, 0, 50, 50])
        self.assertEqual(cropped.size, (70, 70))

    def test_manual_crop_does_not_add_padding(self):
        image = Image.new("RGB", (100, 80), "red")
        cropped = crop_image(image, [0, 0, 500, 1000], pad=False)
        self.assertEqual(cropped.size, (100, 40))


class ParseDetectionTests(SimpleTestCase):
    def test_drops_unknown_categories_and_unusable_boxes(self):
        detections = parse_detections(
            {
                "items": [
                    {
                        "name": "Bananas",
                        "category_slug": "produce",
                        "description": "A bunch of bananas.",
                        "availability_guess": "high",
                        "box_2d": [10, 10, 200, 200],
                    },
                    {
                        "name": "Tiny",
                        "category_slug": "produce",
                        "description": "Too small to crop.",
                        "availability_guess": "low",
                        "box_2d": [0, 0, 5, 5],
                    },
                    {
                        "name": "Soap",
                        "category_slug": "not-a-category",
                        "description": "A bar of soap.",
                        "availability_guess": "maybe",
                        "box_2d": [400, 400, 700, 700],
                    },
                ]
            },
            {"produce"},
        )
        self.assertEqual(len(detections), 2)
        self.assertEqual(detections[0]["category_slug"], "produce")
        self.assertEqual(detections[1]["category_slug"], "")
        self.assertEqual(detections[1]["availability_guess"], "high")
