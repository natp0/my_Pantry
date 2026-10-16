from django.core.management.base import BaseCommand

from inventory.models import Category, Item

CATEGORIES = [
    ("Produce", "produce", 10),
    ("Dairy", "dairy", 20),
    ("Grains", "grains", 30),
    ("Canned", "canned", 40),
    ("Frozen", "frozen", 50),
    ("Snacks", "snacks", 60),
    ("Personal care", "personal-care", 70),
    ("Household", "household", 80),
]

SAMPLE_ITEMS = [
    {
        "name": "Bananas",
        "category": "produce",
        "points": 2,
        "availability": Item.Availability.HIGH,
        "description": "Ripe bananas. Points are examples until pantry staff confirm real values.",
    },
    {
        "name": "Canned black beans",
        "category": "canned",
        "points": 3,
        "availability": Item.Availability.HIGH,
        "description": "15 oz can. Check the shelf for low-sodium options.",
    },
    {
        "name": "Frozen mixed vegetables",
        "category": "frozen",
        "points": 4,
        "availability": Item.Availability.LOW,
        "description": "Bagged mixed vegetables. Availability is an estimate.",
    },
    {
        "name": "Rolled oats",
        "category": "grains",
        "points": 3,
        "availability": Item.Availability.HIGH,
        "description": "Dry oats for breakfast or baking.",
    },
    {
        "name": "Toothpaste",
        "category": "personal-care",
        "points": 5,
        "availability": Item.Availability.OUT,
        "description": "Sample item showing an out-of-stock state.",
    },
]


class Command(BaseCommand):
    help = "Create starter categories and a few sample items if they do not already exist."

    def handle(self, *args, **options):
        categories = {}
        created_categories = 0
        for name, slug, sort_order in CATEGORIES:
            category, created = Category.objects.get_or_create(
                slug=slug,
                defaults={"name": name, "sort_order": sort_order},
            )
            categories[slug] = category
            if created:
                created_categories += 1

        created_items = 0
        for sample in SAMPLE_ITEMS:
            _, created = Item.objects.get_or_create(
                name=sample["name"],
                defaults={
                    "category": categories[sample["category"]],
                    "points": sample["points"],
                    "availability": sample["availability"],
                    "description": sample["description"],
                },
            )
            if created:
                created_items += 1

        self.stdout.write(
            self.style.SUCCESS(
                f"Seed complete. Categories added: {created_categories}. "
                f"Items added: {created_items}."
            )
        )
