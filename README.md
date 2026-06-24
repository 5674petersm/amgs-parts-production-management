# AMGS Parts Production Management

Mobile-friendly web app for operators to scan part QR codes, record production quantity, station, and cart/bin location. Stock parts use `tblstockitems` (including optional `FinalStation`); on-hand qty is read/updated in `tblitemlocation` (`LocOnHandQty` at `LocLocationID` = 1). Every submit inserts `tblproductionlog`. Stock inventory (`tblitemhistory` + `tblitemlocation`) updates only when the selected station matches `FinalStation`, or on every submit if `FinalStation` is empty. Custom part production is log-only (no inventory); **Part complete** marks the line finished on `tblcustomparts` but does not block further entries.

**Production URL pattern:** `https://production.advmgs.com/p/{MasterPNo}`

## Prerequisites

1. Run `sql/create_tblcustomparts.sql` on database `minimrp2025`.
2. Run `sql/create_tblproductionlog.sql` on database `minimrp2025`.
3. Run `sql/add_finalstation_to_tblstockitems.sql` to add `FinalStation` on `tblstockitems`.

**Existing databases:** run `sql/alter_tblcustomparts_completed.sql` and `sql/alter_tblproductionlog_custom_parts.sql` instead of recreating those tables.

4. Google Cloud OAuth client (Web application) with redirect URI:
   - `https://production.advmgs.com/api/auth/callback/google`
   - `http://localhost:3000/api/auth/callback/google` (local dev)
5. SQL Server reachable from your host (firewall / authorized networks).

## Setup

```bash
npm install
cp .env.example .env.local
# Edit .env.local with DB credentials, AUTH_* and Google OAuth values
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Environment variables

| Variable | Purpose |
|----------|---------|
| `DB_SERVER`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD` | SQL Server connection |
| `DB_ENCRYPT`, `DB_TRUST_SERVER_CERTIFICATE` | TLS options |
| `PLANT_TIMEZONE` | IANA zone for `tblproductionlog.TimeStamp` (e.g. `America/Chicago`) |
| `AUTH_SECRET` | Random secret for sessions |
| `AUTH_URL` | Public app URL |
| `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET` | Google OAuth |
| `AUTH_ALLOWED_DOMAIN` | Workspace domain (e.g. `advmgs.com`) |
| `AUTH_ADMIN_EMAILS` | Comma-separated admin emails (full access) |
| `AUTH_ENGINEER_EMAILS` | Comma-separated engineer emails (custom parts + edit stock parts) |
| `ENGINEERING_NOTIFY_EMAILS` | Comma-separated emails or Google Group for final-station alerts |
| `GMAIL_SEND_AS` | From address shown on outbound mail (must be a mailbox or configured send-as alias) |
| `GMAIL_FROM_NAME` | Optional display name for the From header (default: AMGS Production System) |
| `GMAIL_IMPERSONATE_USER` | Optional Workspace user for service-account impersonation; defaults to `GMAIL_SEND_AS` |


Users not listed in either role variable are **Operators** (scan QR codes and record production).

### Email alerts (missing final station)

When an operator scans a part with no final station, they can tap **Send to Engineering**. Email goes to everyone in `ENGINEERING_NOTIFY_EMAILS` (e.g. a Google Group with engineers and admins as members).

1. In Google Admin → Security → API controls → Domain-wide delegation, authorize your service account with scopes:
   - `https://www.googleapis.com/auth/gmail.send`
   - `https://www.googleapis.com/auth/gmail.settings.basic`
2. Set `GMAIL_SEND_AS` to your send-as alias address (e.g. `MRPsystem@advmgs.com`).
3. Set `GMAIL_IMPERSONATE_USER` to the **primary mailbox** that owns that alias (not the alias address).
4. The display name comes from Gmail **Send mail as** settings for that alias. `GMAIL_FROM_NAME` is only a fallback.

## Roles

| Role | Access |
|------|--------|
| **Operator** | Scan QR codes, manual lookup, record production (stock + custom) |
| **Engineer** | Create custom parts, edit stock part description and final station |
| **Admin** | All of the above |

## `tblproductionlog` columns

| Column | Notes |
|--------|--------|
| `ProductionLogID` | Identity PK |
| `ItemID` | Stock part (`tblstockitems`); null for custom rows |
| `CustomPartID` | Custom part (`tblcustomparts`); null for stock rows |
| `MasterPNo` | Part number (stock or custom) |
| `OpStation` | Station name |
| `Qty` | Produced quantity |
| `LocationType` | `Cart` or `Bin` |
| `LocationNo` | 1–50 |
| `[User]` | Google account email |
| `TimeStamp` | Plant-local civil time |
| `Source` | `QR` or `Manual` |

Exactly one of `ItemID` or `CustomPartID` is set per row.

## QR codes

Encode the full URL in each QR code, for example:

`https://production.advmgs.com/p/YOUR-PART-NUMBER`

Use URL encoding if the part number contains special characters.

## Deploy with PM2

This server runs the app from `/srv/amgs/production` with PM2. The app reads environment values from `.env`, so keep that file on the server and out of git.

First-time setup:

```bash
cd /srv/amgs/production
npm install
npm run build
npm run pm2:start
pm2 save
pm2 startup
```

Run the command printed by `pm2 startup` with sudo so PM2 restarts after server reboots.

Deploy updates:

```bash
cd /srv/amgs/production
npm install
npm run pm2:restart
pm2 save
```

Useful PM2 commands:

```bash
pm2 status
npm run pm2:logs
pm2 restart amgs-production --update-env
pm2 stop amgs-production
```

The PM2 app is defined in `ecosystem.config.cjs` and listens on port `3100` by default. Caddy proxies `https://production.advmgs.com` to `http://127.0.0.1:3100`.
