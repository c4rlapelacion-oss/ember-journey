# Deploy EMBER Journey — Step by Step

## Part A — Create Supabase

1. Go to Supabase and create a free project named `EMBER Journey`.
2. Save the database password somewhere private.
3. Wait for the project to finish provisioning.
4. Open **SQL Editor → New query**.
5. Open `supabase/schema.sql` from this project.
6. Copy the entire SQL file into Supabase and click **Run**.

## Part B — Create the two Admin accounts

In Supabase, open **Authentication → Users → Add user**.

Create the first account:

- Email: `jesember@emberjourney.app`
- Password stored in Supabase: `ember#E8`
- Auto Confirm User: enabled

Create the second account:

- Email: `cassyember@emberjourney.app`
- Password stored in Supabase: `ember#E8`
- Auto Confirm User: enabled

The application login credentials displayed to the Admins are still:

- `jesember` / `ember`
- `cassyember` / `ember`

The database trigger automatically assigns both accounts the `admin` role.

## Part C — Get Supabase keys

Open **Project Settings → API** and copy:

- Project URL
- `anon` public key
- `service_role` key

Never place the `service_role` key in source code or GitHub.

## Part D — Test locally

1. Extract the project.
2. Open Terminal in the project folder.
3. Create `.env.local`:

```env
VITE_SUPABASE_URL=YOUR_PROJECT_URL
VITE_SUPABASE_ANON_KEY=YOUR_ANON_KEY
SUPABASE_URL=YOUR_PROJECT_URL
SUPABASE_SERVICE_ROLE_KEY=YOUR_SERVICE_ROLE_KEY
```

4. Run:

```bash
npm install
npm run dev
```

5. Open the local address shown by Vite.
6. Sign in using `jesember` and `ember`.

The Admin can create Participant accounts from **Admin → Participants**.

## Part E — Upload to GitHub

Create a new GitHub repository named `ember-journey`.

In Terminal:

```bash
git init
git branch -M main
git add .
git commit -m "Initial EMBER Journey app"
git remote add origin https://github.com/YOUR_USERNAME/ember-journey.git
git push -u origin main
```

The `.env.local` file is ignored and must not be uploaded.

## Part F — Deploy on Vercel

1. Log in to Vercel using GitHub.
2. Click **Add New → Project**.
3. Import the `ember-journey` repository.
4. Confirm:
   - Framework: Vite
   - Build command: `npm run build`
   - Output directory: `dist`
5. Before deploying, open **Environment Variables**.
6. Add:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`
7. Apply each variable to Production, Preview, and Development.
8. Click **Deploy**.

## Part G — Configure Supabase URL

After Vercel gives you a URL such as:

`https://ember-journey.vercel.app`

In Supabase, open:

**Authentication → URL Configuration**

Set:

- Site URL: your Vercel address
- Redirect URL: `https://YOUR-VERCEL-ADDRESS/**`

## Part H — First real test

1. Sign in as `jesember`.
2. Create one Participant account.
3. Generate a Talk 1 QR code.
4. Open the QR link in a private/incognito browser.
5. Sign in using the Participant account.
6. Write at least 20 words and submit.
7. Confirm that the first flame section appears.
8. Repeat through Talk 8; the cross should appear only after the last reflection.

## Security reminder

Change the two Admin passwords after initial testing. The requested password `ember` is intentionally simple and should not remain in production.
