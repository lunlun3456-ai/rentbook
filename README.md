# Rent Book — rental receipts & reminders over WhatsApp

A tiny, free, no-login web app for landlords. Add tenants, generate a rent
receipt and send it on WhatsApp in one tap, and get flagged when someone's
rent is due or overdue. Works on your phone and your PC because it's just a
web page — and it can sync to a Google Sheet so both devices see the same data.

## What it does

- **Add a tenant**: name, WhatsApp number, monthly rent, due day of month,
  and (optional) the owner name to print on that tenant's receipts.
- **Send a receipt**: pick a tenant, confirm the amount/date, a professional
  receipt image is drawn automatically (letterhead, receipt number, amount,
  date, signature line). **Download** it or **Copy** it, then **Open
  WhatsApp chat** and attach/paste the image there.
- **Reminders**: the Home tab lists anyone due soon or overdue, with a
  **Send reminder via WhatsApp** button per tenant.
- **History**: every receipt you've sent, kept as a log.
- **Sync**: optionally connect a Google Sheet so your phone and PC share the
  same tenant list and history.
- **Password lock**: the app asks for a password before showing anything.
- **Multiple owners**: if your properties aren't all under one name, set an
  owner name per tenant (Tenants tab → edit) — it overrides the default
  name in Settings just for that tenant's receipts.

### Being honest about two things

**Receipts as images, not auto-attached.** WhatsApp's click-to-chat links
can only pre-fill text, not attach a file — that's a WhatsApp restriction,
not something any app can code around for free. So sending a receipt is:
generate the image → Download or Copy it → Open WhatsApp chat (pre-filled
with a short message) → attach/paste the image yourself → send. On a PC,
"Copy" + pasting into WhatsApp Web is the fastest version of this.

**The password lock is a deterrent, not real security.** This is a plain
static web page with no server behind it, so there's no way to enforce a
login the way a real app or bank would. It stops a casual visitor who
stumbles on your link from opening your tenant list, but it would not stop
someone with real technical skill and access to the device. Don't rely on
it for anything truly sensitive. If you ever need proper access control
(e.g. multiple people managing different properties with real accounts),
that requires a real backend/auth service — ask and I can help you plan
that upgrade.

**No free way for a web page to silently message someone on WhatsApp by
itself** — WhatsApp doesn't allow that without their paid Business API and
a verified business account. So instead: every time you open the app, it
immediately shows you who's due/overdue, and sending a reminder is one tap.

---

## 1. Put it on GitHub (so it works from PC and phone)

1. Create a new **public** GitHub repository, e.g. `rent-book`.
2. Upload all the files in this folder (`index.html`, `style.css`, `app.js`,
   `manifest.json`, `sw.js`) to the repo. Easiest way: on the repo page click
   **Add file > Upload files** and drag them in.
3. Go to **Settings > Pages** in the repo.
4. Under "Build and deployment", set **Source** to `Deploy from a branch`,
   branch `main`, folder `/ (root)`. Save.
5. Wait a minute, then GitHub shows you a URL like
   `https://yourname.github.io/rent-book/`. That's your app.
6. Open that URL on your phone and use **"Add to Home Screen"** (Safari:
   share icon > Add to Home Screen. Chrome: menu > Install app). It now
   behaves like a normal app icon.

You and anyone with the link can use the same URL from any device — the data
itself lives on each device's local storage unless you turn on Sheet sync
below.

## 2. Connect a Google Sheet (optional but recommended)

This is what makes your phone and PC show the *same* tenants and history.

1. Go to [sheets.google.com](https://sheets.google.com) and create a new,
   blank spreadsheet (name it anything, e.g. "Rent Book Data").
2. In the sheet, go to **Extensions > Apps Script**.
3. Delete the placeholder code and paste in the contents of
   `apps-script/Code.gs` from this folder.
4. Click **Deploy > New deployment**.
   - Click the gear icon next to "Select type" and choose **Web app**.
   - Execute as: **Me**.
   - Who has access: **Anyone**.
   - Click **Deploy**, then authorize it with your Google account when
     prompted (you'll see an "unverified app" warning since it's your own
     script — click Advanced > Go to project (unsafe) to proceed; it only
     talks to your own sheet).
5. Copy the **Web app URL** it gives you (ends in `/exec`).
6. In the Rent Book app, go to **Settings > Google Sheet sync**, paste the
   URL, tap **Save**, then tap **Push local → Sheet**.
7. On your other device, open the same app URL, go to Settings, paste the
   same script URL, and tap **Pull Sheet → local** to bring the data down.

From then on, tap **Push** after making changes on one device, and **Pull**
on the other to catch up. (This is a manual two-button sync rather than
constant live sync — simple and reliable, no server costs.)

## 3. Everyday use

- **Home tab**: see who's due/overdue, send reminders, send receipts.
- **Tenants tab**: add/edit/delete tenants.
- **History tab**: everything you've sent.
- **Settings tab**: sheet sync, reminder window (how many days before due
  date counts as "soon"), default WhatsApp country code, backup/export.

## Notes on phone numbers

Enter WhatsApp numbers **with country code, no `+` or leading `0`** — e.g. a
Malaysian mobile `012-345 6789` becomes `60123456789`. The app uses this to
build the `wa.me` link that opens WhatsApp directly to that contact.

## Backing up your data

Settings > **Export backup (.json)** downloads everything so you're never
locked in — you can hand this file to any future tool, spreadsheet, or
developer if you outgrow this app.
