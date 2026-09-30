# Pithos — personal nutrition tracker (PWA)

*A pithos is the great storage jar of ancient Greece.*

A dark, athletic-looking nutrition tracker that runs entirely in your browser. You can install it to your iPhone home screen and it works offline. There's no backend, no account and no AI. All your data stays on your phone in IndexedDB.

- **Today:** a calorie ring (eaten / goal / remaining), protein, carb and fat bars (with *of which sugars* under carbs and *of which saturates* under fat), an animated water glass, four meal sections and a date switcher.
- **Meals:** tap a meal's name on Today to open its page: every food in it, total calories against the recommended range, and nutrition (protein, carbs with sugars and fibre, fat with saturates, sodium, potassium, and all vitamins and minerals) against that meal's share of your daily goals. Remove foods there with ✕ or a swipe (with Undo). The chevron on a meal card collapses its list; that's remembered.
- **Quick log:** in the add-food sheet, tap **Quick log** and type everything you had, one food per line or separated by commas, e.g. `200g chicken breast, 2 eggs, 1 scoop impact whey` or `chicken wrap 450kcal 35p 40c 12f sodium 800mg`. Your saved foods are matched first, then CoFID. Amounts can be grams/ml, counts ("2 eggs", "half a banana") or your serving names ("1 scoop"). You can give your own values: kcal, protein/p, carbs/c, fat/f, sugar, sat fat, fibre, sodium (mg), salt (g, converted to sodium) and any vitamin or mineral. Check the list, change a match or an amount, then **Log all** (Undo available). No AI, works offline, free.
- **Supplements:** a small section on Today under Hydration. Add each supplement with its dose and, optionally, what one dose contains (e.g. `vitamin d 25µg, epa+dha 500mg`). Tap one to tick it off for the day; anything it contains counts towards your nutrient totals (and Apple Health), without adding calories or "no data" warnings. Tap the pencil to edit or delete.
- **Water:** the jar fills as you drink. Once you beat your goal, a few drops roll over the rim and down the sides, and a pool forms at the base. The drops replay each time you drink more; the pool just stays.
- **Same as yesterday?** When you add food to a meal, yesterday's version of that meal is offered at the top. One tap copies it all (Undo available). It also appears on an empty meal's page.
- **Nutrients:** 17 nutrients, each with a daily target and an optional upper limit, all editable in Settings. They're shown as progress bars with *Low / % / Met* flags, plus a 7-day average with a per-day strip so nutrients that are consistently low stand out.
  - Tracked: fibre, potassium, magnesium, folate, vitamins C, A, K, D and B12, iron, zinc, calcium, iodine, selenium, omega-3 ALA, EPA + DHA, and sodium.
  - Going over an upper limit turns the bar red ("Over upper limit"). The limits for magnesium (supplements only), folate (supplements / fortified foods) and vitamin A (preformed only) can't be judged from food totals, so they're shown but never flagged.
  - **Sodium works the other way round:** it's a limit (2,300 mg by default). The bar is green below 90%, amber from 90% and red once you reach the limit.
- **Barcodes:** **Scan** starts the live scanner; if it struggles, tap **Take a photo of the barcode** (the phone's camera focuses better and Pithos reads the code from the photo), or type the number. Scanned products show **Save to My foods** and **Edit values**: Open Food Facts data is crowd-sourced and can be out of date, so correct it from the pack once and your copy is used every time you scan it after that.
- **Food search:**
  - UK CoFID (McCance & Widdowson) generic foods, bundled so search works offline.
  - UK branded products from Open Food Facts, plus camera barcode scanning.
  - Missing micronutrients show as **no data**, never as zero. You can link a food to a similar CoFID food to estimate them.
- **Logging:** by g, ml or custom serving sizes ("1 scoop = 25 g"). Add a serving from any food's sheet with **Add serving size**, and change or delete one with **Edit servings**. Changes save as you type, and deleting has Undo.
- **My foods and saved meals.** My foods holds everything you've created, scanned or saved; tap the star on a food to pin it to the top. Foods log in one tap. Saved meals also log in one tap, or you can adjust the amounts before logging.
- **Sugars and saturated fat:** tracked like a UK label, as "of which" values under carbs and fat. Each has a daily maximum (UK reference intakes: 90 g sugars, 20 g saturates, editable in Settings). The number turns ochre from 90% and red once you reach it. Values come from CoFID and Open Food Facts, or you type them in for custom foods.
- **Settings:** calorie and macro goals (with live "macros add up to X kcal"), water goal, micronutrient targets and upper limits, and **Export / Import JSON** backups.
- **Custom foods:** micronutrients are grouped into **Vitamins**, **Minerals** and **Fibre & omega-3s** (the same grouping is used on the Nutrients screen, food details and Settings). Sodium sits under Minerals and is entered in **mg**. If a label only lists salt, sodium (mg) = salt (g) × 400.
- **One-off foods:** when you create a food while adding to a meal, turn off **Save to My foods** to log it just this once without keeping it in your lists. The switch remembers your last choice.
- **Removing logged food:** swipe left on a food in any meal on Today to remove it (Undo appears). You can also do it on the meal's page.
- **Balanced goals:** in Settings, when protein, carbs and fat don't add up to your calorie goal they turn red. Tap **Balance macros** to fit them to the calorie goal (protein is kept; carbs and fat are rescaled in the same proportion), or set the calorie goal to match the macros instead.
- **Deleting:** swipe left on any food or saved meal (Foods screen, or the lists in the add-food sheet) to delete it. A long swipe deletes immediately; a short one reveals a **Delete** button. **Undo** appears for a few seconds. Foods you've already logged stay in your history.
- **Apple Health:** send your daily nutrition and water to Apple Health through an Apple Shortcut. See below.

Design: "modern classical". Warm ivory paper, ink and terracotta, with serif numerals (Cormorant Garamond) and Roman inscription capitals (Cinzel). The Today screen has an open arc gauge framed by laurels, Greek-key section rules, line-art meal icons and a hydria (water jar) that fills as you drink. There's an optional **Marble night** dark theme (Settings → Appearance). Colours: olive = on track, ochre = close to the goal, deep red = over the goal (or a micronutrient that is low). Fonts are bundled under the SIL Open Font License (see `app/fonts/`).

## Deploying to GitHub Pages

> GitHub Pages is free for **public** repositories. A private repo needs a paid GitHub plan for Pages. Your food log never goes into the repo; it only lives on your phone. So making the repo public exposes only the app's code.

1. **Merge the code into `main`.** Open a pull request from `claude/nutrition-tracker-pwa-yst6gn` into `main` on GitHub and merge it.
2. **Turn on Pages via Actions.** In the repo go to **Settings → Pages → Build and deployment → Source** and choose **GitHub Actions**.
3. **Run the deploy.** It runs automatically on every push to `main`. To run it now:
   - Go to **Actions → Deploy to GitHub Pages → Run workflow**.
   - This workflow downloads the latest CoFID spreadsheet from gov.uk and converts it to `app/data/cofid.json`, so the full generic-food database is built into the site.
   - To check it worked, open the *Build CoFID food database* step. It should say `Wrote cofid.json: ~2,900 foods`.
4. **Open your site** at **`https://armaankazemi.github.io/MacroTracker/`** (the address also appears on the workflow run and in Settings → Pages).
5. In the app, go to **Settings → Food database**. It should say "*N generic foods from CoFID…*". If it says "starter set", see *CoFID fallback* below.

### Adding it to your iPhone home screen

1. Open the site in **Safari**. It must be Safari; other iOS browsers can't install web apps.
2. Tap the **Share** button, then **Add to Home Screen**, then **Add**.
3. Launch **Pithos** from the home screen. It opens full-screen, like a native app.
4. Use it once while online, so the app and food database are cached for offline use.
5. The first time you use **Scan**, allow camera access. If the live camera struggles to read a barcode, tap **Take a photo of the barcode**: the iPhone camera focuses better, and Pithos reads the code from the photo.

On Android (Chrome), use **⋮ → Install app** or **Add to Home screen**.

### Apple Health

iPhone web apps can't talk to Apple Health directly. Pithos sends your numbers to an Apple **Shortcut** instead, and the Shortcut writes them into Health. You build the Shortcut once. The app walks you through it: **Settings → Apple Health → How to set it up**.

- Turn on **Show "Send to Health" on Today**, then tap **Send to Health** whenever you want to sync. The Shortcuts app opens briefly; swipe back to Pithos afterwards.
- Only amounts added since your last send are sent, so tapping it more than once never double-counts.
- If a send doesn't arrive, tap **Didn't arrive? Mark as not sent** and send again.
- Sent: calories, protein, carbs, fat, sugars, saturated fat, water, fibre, sodium, potassium, calcium, magnesium, iron, zinc, vitamins A, C, D, K and B12, folate, iodine and selenium. Omega-3s aren't sent, because Health has no type for them.
- Editing or deleting food after sending can't reduce Health from Pithos. Adjust those in the Health app.
- It can't sync automatically in the background. That's an iOS limit for web apps.

### Keep your data safe

Your data lives only on that phone, inside the installed app. Use **Settings → Export JSON** now and then:

- On iPhone this opens the share sheet. Choose **Save to Files**.
- To restore, use **Import JSON**. It replaces everything currently in the app with the backup.
- Deleting the home-screen app or clearing Safari website data erases the app's data. **Export first.**

### Updates

Every deploy stamps a new service-worker version. When you next open the app online, a toast appears saying **Update available → Reload**.

### Checking the CoFID build

The **Check CoFID build** workflow runs whenever the converter changes, and you can also start it by hand from the Actions tab. It downloads the spreadsheet, prints each sheet's layout and lists how many foods have data for each nutrient. Nothing is deployed. If a nutrient suddenly shows 0 foods, gov.uk has changed the spreadsheet's layout.

### CoFID fallback

If the workflow can't fetch the spreadsheet (for example, if gov.uk changes its page), the deploy still succeeds but uses the bundled starter set. To add the full dataset yourself:

1. Download the CoFID `.xlsx` from <https://www.gov.uk/government/publications/composition-of-foods-integrated-dataset-cofid>.
2. Run the converter:
   ```sh
   cd tools && npm install
   node build-cofid.mjs ~/Downloads/<the-file>.xlsx   # writes app/data/cofid.json
   ```
3. Commit `app/data/cofid.json` and push. From then on the workflow keeps using your committed file whenever the download fails.

## Notes on the data

- **CoFID:**
  - Fibre is AOAC fibre where available, otherwise NSP.
  - Vitamin A is retinol equivalents.
  - Vitamin K is K1.
  - Omega-3s come from the "per 100 g food" fatty-acid columns: ALA is C18:3 n-3; EPA + DHA is C20:5 n-3 + C22:6 n-3.
  - Folate is total folate in µg, not DFE, and vitamin A is retinol equivalents, not RAE. Your targets are in DFE and RAE, so treat those two as close approximations.
  - "Tr" (trace) counts as 0. "N" or blank counts as **no data**.
- **Starter set** (`tools/starter-foods.mjs`): about 75 common foods with *approximate* values. It's used for search only until `cofid.json` exists.
- **Pre-loaded favourites:**
  - Calories and macros come from your labels.
  - Each one is linked to the closest generic food, which supplies the micronutrient estimates (shown as **Est.**).
  - Once the full CoFID file is built, these links automatically point at the real CoFID entries (raspberries, blueberries, Greek yoghurt, linseed, peanut butter, oat drink…).
  - Whey protein and peanut powder aren't in CoFID, so they keep the starter estimates.
  - You can change any link from the food's detail sheet.
- **Raw poultry in CoFID:** CoFID has no "chicken breast, raw". Raw breast is listed as *light meat* and leg/thigh as *dark meat*, so the app shows them as "Chicken, light meat (breast), raw" and "Chicken, dark meat (leg/thigh), raw" (same for turkey), and searching "chicken breast" finds them.
- **Search results:** one list, best match first, mixing your saved foods, CoFID and Open Food Facts products (which arrive a moment later). Ranking favours whole-word matches, the plain/raw food when you don't type a cooking method, and foods you use. UK/US spellings (yoghurt/yogurt) match. If Open Food Facts is slow, a **Try again** link appears under the list.
- **Open Food Facts:** minerals and vitamins are converted from OFF's grams to mg or µg. Sodium comes from salt ÷ 2.5 when only salt is listed. When a product doesn't list a value, it shows **no data**. Branded products rarely list iodine, selenium or omega-3s.
- **Totals:** when some logged foods have no data for a nutrient, the Nutrients screen says so ("2 logged foods have no data for Vitamin K — the real total may be higher").

## Project layout

```
app/                    ← the static site (this folder is what gets deployed)
  index.html, manifest.webmanifest, sw.js
  css/app.css
  js/  app.js (router) · today.js · views.js · sheets.js · store.js · db.js · fooddb.js · nutrients.js · ui.js · scanner.js
  data/starter.json     ← bundled starter foods (cofid.json is generated)
  vendor/zxing.min.js   ← barcode decoder for iOS (Apache-2.0)
  fonts/                ← Cormorant Garamond + Cinzel (SIL OFL)
  icons/
tools/                  ← build-cofid.mjs (xlsx → json), starter-foods.mjs, make-icons.mjs
tests/                  ← e2e.mjs (Playwright), cofid-parser.test.mjs, serve.mjs
.github/workflows/deploy.yml
```

There's no build step for the app itself. It's plain HTML, CSS and ES modules.

## Running locally and testing

```sh
node tests/serve.mjs 8080        # then open http://127.0.0.1:8080
cd tools && npm install          # xlsx + playwright
node ../tests/cofid-parser.test.mjs
node ../tests/quickparse.test.mjs   # Quick log text parser
node ../tests/e2e.mjs            # 24 end-to-end checks on an iPhone-sized viewport
```

The e2e suite covers:

- first-run favourites
- one-tap logging
- generic search and logging by grams
- branded search (Open Food Facts is mocked in tests) with "no data" micros and linking to a CoFID food
- barcode lookup
- editing, moving, deleting and undoing entries
- custom foods entered from per-serving labels
- saved meals, including tweaking amounts before logging
- water (add, custom, undo)
- previous days
- goals and the macro→kcal maths
- daily and weekly micronutrients
- export and import (including rejecting a bad file)
- offline use through the service worker
- sodium limit, upper-limit flags and salt→sodium conversion
- upgrading from v1 data (old targets replaced, new nutrients filled into existing entries)
- no JS errors

If you change app files without going through the workflow, bump `VERSION` in `app/sw.js` so phones pick up the change.
