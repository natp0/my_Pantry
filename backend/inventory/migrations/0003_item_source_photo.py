from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ("inventory", "0002_shelfcapture"),
    ]

    operations = [
        migrations.AddField(
            model_name="item",
            name="crop_box",
            field=models.JSONField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="item",
            name="source_image",
            field=models.ImageField(blank=True, null=True, upload_to="item-sources/"),
        ),
        migrations.AddField(
            model_name="item",
            name="source_capture",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name="sourced_items",
                to="inventory.shelfcapture",
            ),
        ),
    ]
