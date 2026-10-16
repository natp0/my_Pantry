# Product

myPantry is a website for the **UF Fork and Field Pantry**. Students can see what is available inside, plan how to spend **points** (the pantry does not use currency), and keep a grocery list while they wait in line. Volunteers keep the catalog current.

The original kickoff described a mobile app. This project is a **responsive website** instead, so anyone can open it on a phone in line without installing an app.

## Who it is for

- **Students / shoppers** browse a catalog, filter by category, see availability and point values, and save items to a grocery list. The list tracks points and lets them cross items off as they shop.
- **Volunteers** add or edit items in Django Admin: name, category, points, photo, and availability (`high`, `low`, or `out of stock`). Staff can also open `/volunteer`, photograph a shelf, correct what Gemini recognized, and save. Each product is cropped into its own catalog photo. Nothing is published until the volunteer confirms it.

## Current website (this repo)

- Public catalog with category tabs
- Item cards: photo, points, availability, description
- Grocery list stored in the browser (`localStorage`) with a planned point total and remaining points
- Footer disclaimer: if you take the last item of a type, tell the checkout volunteer so they can update the site
- Placeholder hours text until pantry staff confirm real hours
- Volunteer Admin for inventory and image uploads
- Staff shelf-photo intake at `/volunteer` (Gemini identifies products; the volunteer edits them before they appear in the catalog)

Point values and sample items in the seed data are examples until the pantry confirms how points actually work.

## Stretch / later

These were in the kickoff report and are **not** built yet:

- Barcode scanning
- Student accounts and a grocery list saved on the server
- Volunteer sign-up
- Fork and Field events (food drives, cooking classes, veggie and flower pickup)
- Donation info and a live “open / closed” hours notice
- Signs at checkout that match the last-item disclaimer

## Out of scope for the pantry site

A second product for **home pantries** (real quantities, storage location, no points or shopping list) could reuse the same inventory idea. It is a separate app, not this website.
