from collections import namedtuple

from django.test import SimpleTestCase

from inventory.matching import find_best_match, initial_actions, normalize_name

NamedItem = namedtuple("NamedItem", ["id", "name"])


class NormalizeNameTests(SimpleTestCase):
    def test_strips_case_and_punctuation(self):
        self.assertEqual(normalize_name("  Canned Black-Beans! "), "canned black beans")


class FindBestMatchTests(SimpleTestCase):
    def setUp(self):
        self.items = [
            NamedItem(1, "Bananas"),
            NamedItem(2, "Canned black beans"),
            NamedItem(3, "Rolled oats"),
        ]

    def test_matches_case_and_punctuation(self):
        match, score = find_best_match("banana!", self.items)
        self.assertEqual(match.id, 1)
        self.assertGreaterEqual(score, 0.72)

    def test_matches_when_catalog_name_contains_the_detection(self):
        match, _score = find_best_match("Black beans", self.items)
        self.assertEqual(match.id, 2)

    def test_ignores_weak_names(self):
        self.assertIsNone(find_best_match("Mystery spice blend", self.items))


class InitialActionTests(SimpleTestCase):
    def test_only_the_first_row_updates_a_shared_item(self):
        self.assertEqual(initial_actions([5, None, 5]), ["update", "create", "create"])
