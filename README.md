# Rent Book — rental receipts & reminders over WhatsApp

A free web app for landlords. Add tenants, generate a rent receipt and send
it on WhatsApp in one tap, and get flagged when someone's rent is due or
overdue. Works on your phone and your PC because it's just a web page — and
**everything is stored in a Google Sheet you own**, not on any one device.

## Important: this app needs a connected Google Sheet to work at all

Unlike a typical app, Rent Book keeps **nothing** on your phone or computer
except the address of your Google Sheet. Every tenant, every receipt, and
every setting (including your password) lives in the sheet. This means:

- The **same data shows up automatically** on your phone and PC — no manual
  "push" or "pull" needed for normal use.
- You **must** be online and have a working sheet connection to open the
  app, add a tenant, or send a receipt — there's no offline fallback.
- The very first thing the app asks for is your Google Sheet's connection
  URL (Part 2 below sets that up). Until that's connected, there's nothing
  to unlock.

## What it does

- **Add a tenant**: name, nickname for the property, WhatsApp number, monthly
  rent, due day of month, address, owner name for the receipt, and lease
  start/end dates with a renewal period in years.
- **Send a receipt**: pick a tenant (amount auto-fills from their rent, but
  you can edit it), pick the month it's for, and a professional receipt
  image is drawn automatically — letterhead, receipt number, wrapped
  address, formatted amount with commas, days overdue (only if late), the
  next payment date, a utility-bill reminder notice, and a "computer
  generated, no signature required" footer. **Download** it or **Copy** it,
  then **Open WhatsApp chat** and attach/paste the image there.
- **Countdown**: every tenant shows a live countdown to their next payment,
  plus — once you've logged a payment — whether they paid early, late, or
  on time that month.
- **Summary**: the History tab shows collected-this-month, collected
  all-time, outstanding right now, and active tenant count.
- **Tenant statements**: the Statement tab builds a printable, save-as-PDF
  statement of a tenant's payments across any month range.
- **Password lock**: the app asks for a password before showing anything.
  The password (as a secure hash, never in plain text) lives in the sheet
  too, so it protects the sheet no matter which device connects to it.
- **Multiple owners**: set an owner name per tenant (Tenants tab → edit) to
  override the default name in Settings just for that tenant's receipts.

### Being honest about three things

**Receipts as images, not auto-attached.** WhatsApp's click-to-chat links
can only pre-fill text, not attach a file — that's a WhatsApp restriction,
not something any app can code around for free. So sending a receipt is:
generate the image → Download or Copy it → Open WhatsApp chat (pre-filled
with a short message) → attach/paste the image yourself → send. On a PC,
"Copy" + pasting into WhatsApp Web is the fastest version of this.

**The password lock is a deterrent, not real security.** This is a plain
static web page with no real backend, so there's no way to enforce a login
the way a bank or a proper app would. It stops a casual visitor from
opening your tenant list, but it would not stop someone with real technical
skill. Don't rely on it for anything truly sensitive. If you ever need
proper access control (e.g. multiple people managing different properties
with real accounts), that requires a real backend/auth service — ask and I
can help you plan that upgrade.

**No free way for a web page to silently message someone on WhatsApp by
itself** — WhatsApp doesn't allow that without their paid Business API and
a verified business account. So instead: every time you open the app, it
immediately shows you who's due/overdue, and sending a reminder is one tap.

---

## 1. Put it on GitHub (so it works from PC and phone)

1. Create a new **public** GitHub repository, e.g. `rent-book`.
2. Upload all the files in this folder (`index.html`, `style.css`, `app.js`,
   `manifest.json`, `sw.js`) to the repo. Easiest way: on the repo page click
   **Add file > Upload files** and drag them in — all at once, in one batch.
3. Go to **Settings > Pages** in the repo.
4. Under "Build and deployment", set **Source** to `Deploy from a branch`,
   branch `main`, folder `/ (root)`. Save.
5. Wait a minute or two, then GitHub shows you a URL like
   `https://yourname.github.io/rent-book/`. That's your app.
6. Open that URL on your phone and use **"Add to Home Screen"** (Safari:
   share icon > Add to Home Screen. Chrome: menu > Install app). It now
   behaves like a normal app icon.

## 2. Connect a Google Sheet (required — the app won't run without this)

1. Go to [sheets.google.com](https://sheets.google.com) and create a new,
   blank spreadsheet (name it anything, e.g. "Rent Book Data").
2. In the sheet, go to **Extensions > Apps Script**.
3. Delete the placeholder code and paste in the full contents of
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
6. Open your Rent Book app link. The very first screen asks for this URL —
   paste it in and tap **Connect**. The app loads whatever's in the sheet
   (empty, the first time) and asks you to set a password.
7. On your other device, open the same app link, paste the **same** script
   URL when it asks, and enter the same password. You'll see the same
   tenants and history immediately, since it's reading the same sheet.

From then on, every add, edit, or receipt saves straight to the sheet — no
manual sync step for everyday use. If two devices happen to edit at the
exact same moment, the sheet keeps whichever save landed last (this is rare
for a one- or two-person workflow). If a device was offline and made
changes that failed to save, it'll tell you plainly rather than silently
losing them — reconnect and try that save again.

### If you ever need to switch to a different sheet

Settings → **Connected Google Sheet** → paste the new URL → **Save &
reconnect**. This changes which sheet the app talks to; it does not copy
data between sheets. Use **Export backup (.json)** first if you need a copy
of what's in the old one.

## 3. Everyday use

- **Home tab**: see who's due/overdue, send reminders, send receipts.
- **Tenants tab**: add/edit/delete tenants.
- **History tab**: summary totals and everything you've sent.
- **Statement tab**: printable/PDF statement for one tenant across a month range.
- **Settings tab**: connected sheet, reminder window (how many days before
  due date counts as "soon"), default WhatsApp country code, password,
  backup/export.

## Notes on phone numbers

Enter WhatsApp numbers **with country code, no `+` or leading `0`** — e.g. a
Malaysian mobile `012-345 6789` becomes `60123456789`. The app uses this to
build the `wa.me` link that opens WhatsApp directly to that contact.

## Backing up your data

Settings > **Export backup (.json)** downloads everything so you're never
locked in — you can hand this file to any future tool, spreadsheet, or
developer if you outgrow this app. Your Google Sheet itself is also a
readable backup at all times — open it directly in Google Sheets to see
your raw data, or use Google Sheets' own version history to recover an
earlier state if something gets accidentally erased.
