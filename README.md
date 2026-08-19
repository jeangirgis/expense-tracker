# Expense Tracker — Organization

A Dockerized expense management app connected to **Google Sheets** as the source of truth. Built for deployment via **Portainer** from any environment.

## Features

- ✅ Single expense submission form
- ✅ Bulk CSV upload (drag & drop)
- ✅ Live dashboard with spending breakdown
- ✅ Full records view
- ✅ Google Sheets as backend (no database needed)
- ✅ GitHub Actions → GHCR → Portainer CD pipeline
- ✅ Multi-arch Docker image (amd64 + arm64)

---

## Quick Start

### 1. Google Cloud Setup

1. Go to [Google Cloud Console](https://console.cloud.google.com)
2. Create a new project (or use an existing one)
3. Enable the **Google Sheets API**
4. Create a **Service Account** → download the JSON key
5. Place the key at `secrets/service-account.json`
6. Share your Google Sheet with the service account email (`...@...iam.gserviceaccount.com`) as **Editor**

### 2. Configure Environment

```bash
cp .env.example .env
# Edit .env with your Google Sheet ID
```

### 3. Run with Docker

```bash
mkdir -p secrets
cp your-service-account-key.json secrets/service-account.json
docker-compose up --build -d
```

App runs at **http://localhost:5000**

---

## CSV Format for Bulk Upload

| Column | Required | Example |
|---|---|---|
| `date` | ✅ | `2024-08-12` |
| `category` | ✅ | `Travel` |
| `amount` | ✅ | `1250.00` |
| `description` | Optional | `Flight to Riyadh` |
| `currency` | Optional | `SAR` (default: USD) |
| `payment_method` | Optional | `Corporate Card` |
| `vendor` | Optional | `Saudia` |
| `receipt_url` | Optional | Google Drive link |
| `submitted_by` | Optional | `Ahmed Ali` |

Download the template directly from the app's Bulk Upload page.

---

## API Endpoints

| Method | Endpoint | Description |
|---|---|---|
| GET | `/health` | Health check (for Portainer/infra monitoring) |
| GET | `/api/expenses` | Fetch all expense rows |
| POST | `/api/expenses` | Submit a single expense (JSON) |
| POST | `/api/expenses/bulk` | Bulk upload via CSV file |
| POST | `/api/expenses/bulk-json` | Bulk upload via JSON array |
| GET | `/api/summary` | Dashboard stats (total, count, by_category) |

---

## GitHub → Portainer Deployment

### Step 1 — Enable GHCR

In your GitHub repo: **Settings → Actions → General → Workflow permissions → Read and write permissions**

### Step 2 — Push to main

Every push to `main` triggers the GitHub Action, which builds and pushes:
```
ghcr.io/jeangirgis/expense-tracker:latest
```

### Step 3 — Deploy in Portainer

1. Go to **Portainer → Stacks → Add Stack**
2. Name: `expense-tracker`
3. Build method: **Web editor**
4. Paste the contents of `portainer-stack.yml`
5. Set environment variables:
   - `GOOGLE_SHEET_ID` = your Sheet ID
   - `APP_SECRET_KEY` = a random secure string
6. SSH to your Docker host and place the service account key:
   ```bash
   sudo mkdir -p /var/data/expense-tracker/secrets
   sudo cp your-service-account.json /var/data/expense-tracker/secrets/
   ```
7. Click **Deploy the stack**

### Updating Any Environment

```
Portainer → Stacks → expense-tracker → Pull and redeploy
```

---

## Project Structure

```
expense-tracker/
├── app.py                          # Flask backend
├── templates/
│   └── index.html                  # UI
├── static/
│   ├── css/style.css
│   └── js/app.js
├── Dockerfile
├── docker-compose.yml
├── portainer-stack.yml
├── requirements.txt
├── .env.example
├── .gitignore
├── .dockerignore
└── .github/
    └── workflows/
        └── docker-publish.yml      # CI/CD pipeline
```

---

## License

Private — Organization Internal Use Only
