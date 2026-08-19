import os
import json
import csv
import io
import datetime
from flask import Flask, render_template, request, jsonify
from google.oauth2 import service_account
from googleapiclient.discovery import build
from googleapiclient.errors import HttpError
import pandas as pd
import base64

app = Flask(__name__)
app.config['MAX_CONTENT_LENGTH'] = 16 * 1024 * 1024  # 16MB max upload

# ─── Configuration ──────────────────────────────────────────────────────────
SCOPES = ['https://www.googleapis.com/auth/spreadsheets']
SHEET_ID = os.environ.get('GOOGLE_SHEET_ID')

# Credentials can come from:
#   1. GOOGLE_SERVICE_ACCOUNT_JSON  — full JSON string (recommended for Portainer)
#   2. GOOGLE_SERVICE_ACCOUNT_FILE  — path to JSON file (legacy / local dev)
SERVICE_ACCOUNT_JSON = os.environ.get('GOOGLE_SERVICE_ACCOUNT_JSON')        # full JSON string
SERVICE_ACCOUNT_FILE = os.environ.get(                                        # file path fallback
    'GOOGLE_SERVICE_ACCOUNT_FILE', '/app/secrets/service-account.json'
)
EXPENSES_TAB = 'Expenses'

HEADERS = [
    'Date', 'Category', 'Description', 'Amount', 'Currency',
    'Payment Method', 'Vendor', 'Receipt URL', 'Submitted By', 'Timestamp'
]

# ─── Google Sheets Helper ────────────────────────────────────────────────────
def get_sheets_service():
    """Authenticate and return Google Sheets API service.

    Credential priority:
      1. GOOGLE_SERVICE_ACCOUNT_JSON env var (JSON string) — ideal for Portainer
      2. GOOGLE_SERVICE_ACCOUNT_FILE env var (file path)   — local / legacy
    """
    if SERVICE_ACCOUNT_JSON:
        # Parse JSON directly from the environment variable
        info = json.loads(SERVICE_ACCOUNT_JSON)
        credentials = service_account.Credentials.from_service_account_info(
            info, scopes=SCOPES
        )
    else:
        credentials = service_account.Credentials.from_service_account_file(
            SERVICE_ACCOUNT_FILE, scopes=SCOPES
        )
    return build('sheets', 'v4', credentials=credentials, cache_discovery=False)


def ensure_sheet_structure(service):
    """Ensure the Expenses tab exists with proper headers."""
    try:
        spreadsheet = service.spreadsheets().get(spreadsheetId=SHEET_ID).execute()
        sheet_names = [s['properties']['title'] for s in spreadsheet['sheets']]

        if EXPENSES_TAB not in sheet_names:
            body = {
                'requests': [{
                    'addSheet': {
                        'properties': {
                            'title': EXPENSES_TAB,
                            'gridProperties': {'rowCount': 5000, 'columnCount': 10}
                        }
                    }
                }]
            }
            service.spreadsheets().batchUpdate(
                spreadsheetId=SHEET_ID, body=body
            ).execute()

        # Write headers to row 1
        service.spreadsheets().values().update(
            spreadsheetId=SHEET_ID,
            range=f'{EXPENSES_TAB}!A1',
            valueInputOption='RAW',
            body={'values': [HEADERS]}
        ).execute()

    except HttpError as e:
        print(f"Sheet structure error: {e}")
        raise


def append_expenses(service, rows):
    """Append multiple expense rows to the sheet."""
    body = {'values': rows}
    return service.spreadsheets().values().append(
        spreadsheetId=SHEET_ID,
        range=f'{EXPENSES_TAB}!A1',
        valueInputOption='USER_ENTERED',
        insertDataOption='INSERT_ROWS',
        body=body
    ).execute()


def get_all_expenses(service):
    """Fetch all expenses from the sheet."""
    result = service.spreadsheets().values().get(
        spreadsheetId=SHEET_ID,
        range=f'{EXPENSES_TAB}!A1:J5000'
    ).execute()
    return result.get('values', [])


# ─── Routes ──────────────────────────────────────────────────────────────────
@app.route('/health')
def health():
    return jsonify({
        'status': 'ok',
        'timestamp': datetime.datetime.utcnow().isoformat()
    })


@app.route('/')
def index():
    return render_template('index.html')


@app.route('/api/expenses', methods=['GET'])
def api_get_expenses():
    try:
        service = get_sheets_service()
        data = get_all_expenses(service)
        return jsonify({'success': True, 'data': data})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


@app.route('/api/expenses', methods=['POST'])
def api_add_expense():
    try:
        service = get_sheets_service()
        ensure_sheet_structure(service)
        payload = request.get_json()
        now = datetime.datetime.utcnow().isoformat()
        row = [
            payload.get('date', datetime.date.today().isoformat()),
            payload.get('category', ''),
            payload.get('description', ''),
            payload.get('amount', ''),
            payload.get('currency', 'USD'),
            payload.get('payment_method', ''),
            payload.get('vendor', ''),
            payload.get('receipt_url', ''),
            payload.get('submitted_by', ''),
            now
        ]
        append_expenses(service, [row])
        return jsonify({'success': True, 'message': 'Expense recorded'})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


@app.route('/api/expenses/bulk', methods=['POST'])
def api_bulk_upload():
    """Bulk upload expenses via CSV file."""
    try:
        if 'file' not in request.files:
            return jsonify({'success': False, 'error': 'No file provided'}), 400

        file = request.files['file']
        if file.filename == '':
            return jsonify({'success': False, 'error': 'Empty filename'}), 400
        if not file.filename.lower().endswith('.csv'):
            return jsonify({'success': False, 'error': 'Only CSV files allowed'}), 400

        stream = io.StringIO(file.stream.read().decode('utf-8'))
        reader = csv.DictReader(stream)
        required = {'date', 'category', 'amount'}
        fieldnames = set(reader.fieldnames or [])
        if not required.issubset(fieldnames):
            return jsonify({
                'success': False,
                'error': f'CSV must contain columns: {required}. Found: {list(fieldnames)}'
            }), 400

        service = get_sheets_service()
        ensure_sheet_structure(service)

        rows = []
        now = datetime.datetime.utcnow().isoformat()
        for row in reader:
            rows.append([
                row.get('date', ''),
                row.get('category', ''),
                row.get('description', ''),
                row.get('amount', ''),
                row.get('currency', 'USD'),
                row.get('payment_method', ''),
                row.get('vendor', ''),
                row.get('receipt_url', ''),
                row.get('submitted_by', ''),
                now
            ])

        if not rows:
            return jsonify({'success': False, 'error': 'No valid rows found in CSV'}), 400

        append_expenses(service, rows)
        return jsonify({
            'success': True,
            'message': f'{len(rows)} expenses uploaded successfully',
            'count': len(rows)
        })
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


@app.route('/api/expenses/bulk-json', methods=['POST'])
def api_bulk_json():
    """Bulk upload via JSON array."""
    try:
        payload = request.get_json()
        if not isinstance(payload, list):
            return jsonify({'success': False, 'error': 'Expected JSON array'}), 400

        service = get_sheets_service()
        ensure_sheet_structure(service)

        rows = []
        now = datetime.datetime.utcnow().isoformat()
        for item in payload:
            rows.append([
                item.get('date', datetime.date.today().isoformat()),
                item.get('category', ''),
                item.get('description', ''),
                item.get('amount', ''),
                item.get('currency', 'USD'),
                item.get('payment_method', ''),
                item.get('vendor', ''),
                item.get('receipt_url', ''),
                item.get('submitted_by', ''),
                now
            ])

        append_expenses(service, rows)
        return jsonify({
            'success': True,
            'message': f'{len(rows)} expenses uploaded',
            'count': len(rows)
        })
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


@app.route('/api/summary')
def api_summary():
    """Return summary stats for dashboard."""
    try:
        service = get_sheets_service()
        data = get_all_expenses(service)

        if len(data) <= 1:
            return jsonify({'success': True, 'total': 0, 'count': 0, 'by_category': {}})

        rows = data[1:]  # skip header
        total = 0
        by_category = {}
        for row in rows:
            try:
                amt = float(row[3]) if len(row) > 3 else 0
                total += amt
                cat = row[1] if len(row) > 1 else 'Uncategorized'
                by_category[cat] = by_category.get(cat, 0) + amt
            except (ValueError, IndexError):
                continue

        return jsonify({
            'success': True,
            'total': round(total, 2),
            'count': len(rows),
            'by_category': by_category
        })
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000, debug=True)
