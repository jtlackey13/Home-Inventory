# Home Inventory — Cloud Edition (Version 3)

**What this contains:** a four-tab inventory web application (Home, Add, Inventory, Backup & Restore), email/password sign-in, Supabase cloud storage, private database permissions, editable rooms/containers/items, full inventory search, and an all-or-nothing restore of your old JSON backups.

The application code is designed to be hosted on GitHub Pages. Your inventory records are **not** stored in GitHub; they live in your Supabase database. A GitHub Pages site is publicly accessible, but the database enforces per-user access controls.

## A. Before you begin

1. Open the *previous* version of Home Inventory (the one you've been testing) in your usual browser.
2. Click **Backup & Restore → Export backup** and save the JSON file somewhere you can find later.
3. Download/extract this ZIP. The extracted `home-inventory-cloud` folder contains `index.html`, `app.js`, `style.css`, `config.js`, `database.sql`, `.nojekyll`, and this `README.md`.
4. You'll need a GitHub account and a free or paid Supabase account. The free tiers may be adequate initially, subject to current service limits, quotas, and possible project pauses.

## B. Create your Supabase database

1. Go to **https://supabase.com/** and sign in or create an account.
2. In the Supabase dashboard, select **New project**. Choose a name such as `home-inventory`, choose a strong database password, and select a nearby region. **Store the password in your password manager.** The app itself does not use this password.
3. Once the project is ready, open **SQL Editor** from the sidebar and click **New query**.
4. On your Mac, open the downloaded `database.sql` file in TextEdit or a code editor, copy the **entire** contents, paste into the query editor, and press **Run**.
5. Confirm it finishes successfully. You can check **Table Editor**, where you should now see **rooms**, **boxes**, and **items** (initially empty).
6. **Important:** the SQL is intended for a brand-new project. Do not run it over existing tables of those names that contain unrelated data.

## C. Obtain the two browser-safe connection values

1. In your Supabase project, click **Connect** (or **Project Settings → API Keys** in the left sidebar).
2. Copy your project's **Project URL** (similar to `https://abcdefgh.supabase.co`).
3. Copy the **Publishable key**, which starts with `sb_publishable_`.
4. Do **not** use the `Secret`, `service_role`, `sb_secret_`, database password, or JWT secret. These must **never** go in the GitHub repository or the browser app.

## D. Configure the app on your Mac

1. Open the extracted **home-inventory-cloud** folder.
2. Open `config.js` using TextEdit (plain text mode) or another text/code editor.
3. Replace `YOUR_SUPABASE_PROJECT_URL` with your real project URL, inside the existing quotation marks.
4. Replace `YOUR_SUPABASE_PUBLISHABLE_KEY` with your real publishable key, also inside the quotation marks.
5. Leave the rest of the file unchanged, save, and close. It should still be called `config.js`, **not** `config.js.txt`.

It should look like this (the examples below are fake):

```js
window.HOME_INVENTORY_CONFIG = {
  supabaseUrl: "https://abcdefgh.supabase.co",
  supabasePublishableKey: "sb_publishable_EXAMPLE_NOT_REAL"
};
```

The publishable key is specifically intended for code that runs in a browser. Its presence in public website source is expected; **row-level security (RLS)** in `database.sql` protects your data.

## E. Create the website in GitHub

1. Open **https://github.com/new** while signed into GitHub.
2. Enter repository name: **`home-inventory`**.
3. Select **Public** if you're using GitHub Free. (Public repository code is fine because it contains only website files, SQL instructions, and a publishable key—not the actual inventory or secrets.)
4. Click **Create repository**. You may leave **Add a README file** unchecked for simplicity.
5. In your new repository, look for **uploading an existing file**, or use **Add file → Upload files**.
6. Drag these files **from inside** your extracted folder into the upload area: `index.html`, `style.css`, `app.js`, `config.js`, `database.sql`, and `README.md` (also `.nojekyll` if visible). Do **not** upload the ZIP itself. These files should be in the repository **root**, not nested inside a `home-inventory-cloud` folder.
7. Click **Commit changes** (or the equivalent button at the bottom). GitHub can also create the repo with a README first, then you use **Add file → Upload files**.
8. In the repository, click **Settings → Pages** (under **Code and automation**).
9. Under **Build and deployment**, set **Source** to **Deploy from a branch**. Choose branch **main**, folder **/(root)**, then click **Save**.
10. GitHub Pages will show your site URL, usually **`https://YOUR-GITHUB-USERNAME.github.io/home-inventory/`**. Open the **Visit site** link in Pages settings when it is available. If it is not live immediately, refresh the Pages settings later; publishing can take several minutes.

**Note:** Some dotfiles, such as `.nojekyll`, may be hidden by macOS. You can omit it for now; none of the app's required files begins with an underscore and this app does not need a special build step.

## F. Configure Supabase's confirmation-email links

1. Copy the **exact GitHub Pages website URL** from your published site (including the final `/home-inventory/` part if present).
2. Return to Supabase dashboard → **Authentication → URL Configuration**.
3. Set **Site URL** to that exact website URL.
4. Under **Redirect URLs**, add the **same exact URL** and save.
5. For password-based login, check that the Email provider is enabled under **Authentication → Providers**. Leave email confirmation on for better security.

*Why this matters:* When you create an account or reset your password, Supabase sends an email link. The link must redirect back to your deployed website, not to `localhost:3000`.

## G. Create an account and test cloud synchronization

1. On the GitHub Pages website, enter your email and a strong password and click **Create account**.
2. Check your inbox and click the Supabase confirmation link. Then sign in at the website.
3. On **Add**, create a room called `Garage`, a container `G-001` named `Test box`, and an item called `Extension cord` with quantity `2`.
4. Go to **Home** and search `extension`; confirm the result shows the Garage and `G-001`.
5. Go to **Inventory** and expand Garage → G-001. Verify editing and browsing work.
6. Open the website in another browser or your iPhone, sign in with the **same account**, and verify the test inventory appears there too. Refresh the page to pick up changes made on another device.

**If the screen displays an error about missing tables:** go back to Step B and confirm `database.sql` ran successfully. **If confirmation email directs you to localhost:** revisit Step F. **If the website says “Connect the database”:** revisit Step D and make sure your edited `config.js` was committed and published.

## H. Move your Version 2 inventory into the cloud

1. Keep the backup from Step A in a safe location.
2. On the live, signed-in website, open **Backup & Restore** and download a backup of any cloud test items if you want to keep them.
3. Select your **old Home Inventory JSON file** under **Restore a backup**. Verify that the screen displays the expected number of rooms, containers and item entries.
4. Check **I understand this will replace all current cloud inventory**, then click **Replace inventory from backup** and confirm the warning dialog.
5. Wait for the success message. The database restore is **transactional**: if any record fails to import, the whole change is rolled back.
6. Check Home and Inventory. Search several previously entered items to confirm the migration.
7. Save a fresh backup of your cloud inventory and keep it in a safe place.

Restoring **replaces** cloud data, including test items, rather than merging with them. If your old local prototype was only used for testing, you can skip the import and just begin adding real inventory online.

## I. Add the site to your iPhone Home Screen

1. Open the GitHub Pages site in **Safari** on your iPhone.
2. Use Safari's **Share** menu → **Add to Home Screen** (the exact menu position may vary by iOS version).
3. Choose a name, e.g. `Home Inventory`, then tap **Add**.
4. Open the new Home Screen icon and sign in if needed.

Your data is synced via Supabase, not through the Home Screen icon. On this initial cloud version, refresh the page to see another device's changes; live push synchronization can be added later.

## J. Keep it safe

- The GitHub Pages **site and source code are public**. Do not commit any private inventory JSON files, photos, passwords, or Supabase secret keys to the repository.
- Each authenticated user currently gets a **separate inventory**. Household-shared inventories/accounts can be built later if needed.
- Back up occasionally from the Backup & Restore tab. The database is online but independent backups are still important.
- The **Copy direct link** control in each container creates a permanent container URL, paving the way for QR stickers later. The destination still requires sign-in.
- If Supabase project limits change or a free project pauses, check its dashboard. The ZIP does not include an offline-first data store.

## Troubleshooting

| Symptom | What to do |
| --- | --- |
| “Connect the database” | `config.js` still contains placeholders, or incorrect URL/key; edit, commit, and allow Pages to republish. |
| No confirmation email | Check spam, Supabase Authentication settings, and the platform's default email-sending limits. |
| Email confirmation goes to localhost | Set Supabase **Authentication → URL Configuration → Site URL** and Redirect URLs to your exact Pages URL. |
| “Could not load your inventory” | Confirm the complete SQL ran successfully and check the error shown. |
| Error on restoring JSON | Verify that it's the backup file from Home Inventory Version 1/2, and that each item refers to an existing container. |
| Different inventory on iPhone | Sign in with the same email/account and refresh. |
| Can't find the URL | GitHub repository → Settings → Pages → Visit site. |

## Files for future updates

- `index.html` — screens and forms
- `style.css` — colors, spacing, mobile responsiveness
- `app.js` — app logic, search, add/edit/delete, auth, backup
- `config.js` — public Supabase Project URL and publishable key
- `database.sql` — run once to set up the tables and secure database restore
- `.nojekyll` — harmless GitHub Pages marker
- `README.md` — this guide
