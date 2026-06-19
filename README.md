# AMGS Parts Production Management

Mobile-friendly web app for operators to scan part QR codes, record production quantity, station, and cart/bin location. Part details come from `tblstockitems` (including optional `FinalStation`); on-hand qty is read/updated in `tblitemlocation` (`LocOnHandQty` at `LocLocationID` = 1). Every submit inserts `tblproductionlog`. Inventory (`tblitemhistory` + `tblitemlocation`) updates only when the selected station matches `FinalStation`, or on every submit if `FinalStation` is empty.

**Production URL pattern:** `https://production.advmgs.com/p/{MasterPNo}`

## Prerequisites

1. Run `sql/create_tblproductionlog.sql` on database `minimrp2025`.
2. Run `sql/add_finalstation_to_tblstockitems.sql` to add `FinalStation` on `tblstockitems`.
2. Google Cloud OAuth client (Web application) with redirect URI:
   - `https://production.advmgs.com/api/auth/callback/google`
   - `http://localhost:3000/api/auth/callback/google` (local dev)
3. SQL Server reachable from your host (firewall / authorized networks).

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

## `tblproductionlog` columns

| Column | Notes |
|--------|--------|
| `ProductionLogID` | Identity PK |
| `ItemID`, `MasterPNo` | Part reference |
| `OpStation` | Station name |
| `Qty` | Produced quantity |
| `LocationType` | `Cart` or `Bin` |
| `LocationNo` | 1–50 |
| `[User]` | Google account email |
| `TimeStamp` | Plant-local civil time |
| `Source` | `QR` or `Manual` |

## QR codes

Encode the full URL in each QR code, for example:

`https://production.advmgs.com/p/YOUR-PART-NUMBER`

Use URL encoding if the part number contains special characters.

## Deploy

Build with `npm run build` and run `npm start`, or deploy to Cloud Run, Vercel, or any Node host. Set all environment variables in the hosting platform. Point `production.advmgs.com` to the deployment.
