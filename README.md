# Fuel — personal nutrition tracker (PWA)

A dark, athletic-looking nutrition tracker that runs entirely in your browser. You can install it to your iPhone home screen and it works offline. There's no backend, no account and no AI. All your data stays on your phone in IndexedDB.

- **Today:** a calorie ring (eaten / goal / remaining), protein, carb and fat bars, an animated water glass, four meal sections and a date switcher.
- **Nutrients:** 11 micronutrients (UK reference values, which you can edit) shown as progress bars with *Low / % / Met* flags. There's also a 7-day average with a per-day strip, so nutrients that are consistently low stand out.
- **Food search:**
  - UK CoFID (McCance & Widdowson) generic foods, bundled so search works offline.
  - UK branded products from Open Food Facts, plus camera barcode scanning.
  - Missing micronutrients show as **no data**, never as zero. You can link a food to a similar CoFID food to estimate them.
- **Logging:** by g, ml or custom serving sizes ("1 scoop = 25 g").
- **Custom foods, favourites and saved meals.** Favourites log in one tap. Saved meals also log in one tap, or you can adjust the amounts before logging.
- **Settings:** calorie and macro goals (with live "macros add up to X kcal"), water goal, micronutrient targets, and **Export / Import JSON** backups.

Colours: green = on track, amber = close to the goal, red = over the goal (or a micronutrient that is low).

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
3. Launch **Fuel** from the home screen. It opens full-screen, like a native app.
4. Use it once while online, so the app and food database are cached for offline use.
5. The first time you use **Scan**, allow camera access.

On Android (Chrome), use **⋮ → Install app** or **Add to Home screen**.

### Keep your data safe

Your data lives only on that phone, inside the installed app. Use **Settings → Export JSON** now and then:

- On iPhone this opens the share sheet. Choose **Save to Files**.
- To restore, use **Import JSON**. It replaces everything currently in the app with the backup.
- Deleting the home-screen app or clearing Safari website data erases the app's data. **Export first.**

### Updates

Every deploy stamps a new service-worker version. When you next open the app online, a toast appears saying **Update available → Reload**.

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
  - "Tr" (trace) counts as 0. "N" or blank counts as **no data**.
- **Starter set** (`tools/starter-foods.mjs`): about 75 common foods with *approximate* values. It's used for search only until `cofid.json` exists.
- **Pre-loaded favourites:**
  - Calories and macros come from your labels.
  - Each one is linked to the closest generic food, which supplies the micronutrient estimates (shown as **Est.**).
  - Once the full CoFID file is built, these links automatically point at the real CoFID entries (raspberries, blueberries, Greek yoghurt, linseed, peanut butter, oat drink…).
  - Whey protein and peanut powder aren't in CoFID, so they keep the starter estimates.
  - You can change any link from the food's detail sheet.
- **Open Food Facts:** minerals and vitamins are converted from OFF's grams to mg or µg. When a product doesn't list a value, it shows **no data**.
- **Totals:** when some logged foods have no data for a nutrient, the Nutrients screen says so ("2 logged foods have no data for Vitamin K — the real total may be higher").

## Project layout

```
app/                    ← the static site (this folder is what gets deployed)
  index.html, manifest.webmanifest, sw.js
  css/app.css
  js/  app.js (router) · today.js · views.js · sheets.js · store.js · db.js · fooddb.js · nutrients.js · ui.js · scanner.js
  data/starter.json     ← bundled starter foods (cofid.json is generated)
  vendor/zxing.min.js   ← barcode decoder for iOS (Apache-2.0)
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
node ../tests/e2e.mjs            # 20 end-to-end checks on an iPhone-sized viewport
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
- no JS errors

If you change app files without going through the workflow, bump `VERSION` in `app/sw.js` so phones pick up the change.
