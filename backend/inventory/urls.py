from django.urls import path

from .views import (
    CategoryListView,
    IntakeConfirmView,
    IntakeView,
    ItemListView,
    StaffItemListView,
    StaffItemUpdateView,
    StaffTokenView,
)

urlpatterns = [
    path("categories/", CategoryListView.as_view(), name="category-list"),
    path("items/", ItemListView.as_view(), name="item-list"),
    path("staff/items/", StaffItemListView.as_view(), name="staff-item-list"),
    path("staff/items/<int:pk>/", StaffItemUpdateView.as_view(), name="staff-item-update"),
    path("auth/token/", StaffTokenView.as_view(), name="staff-token"),
    path("intake/", IntakeView.as_view(), name="intake"),
    path("intake/<int:pk>/confirm/", IntakeConfirmView.as_view(), name="intake-confirm"),
]
