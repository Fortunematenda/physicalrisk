# WordPress → MOSS public questionnaire

Clients from the Physical Risk WordPress site complete a **public questionnaire**.  
Contact details create a CRM-ready lead immediately. No client portal account is created yet.

## WordPress button

```text
https://YOUR_MOSS_HOST/start?source=wordpress
```

Local:

```text
http://localhost:8081/start?source=wordpress
```

```html
<a class="wp-block-button__link"
   href="https://YOUR_MOSS_HOST/start?source=wordpress">
  Start Security Cost Leakage Assessment
</a>
```

## Flow

1. Client opens `/start` (no login).
2. Enters organisation + contact details → **lead created immediately** (CRM-ready).
3. Completes calibration + guided SCLI questionnaire (codes and risk scores are hidden).
4. On the last question: **Submit & evaluate** (no portal account, no auto-login).
5. Client sees a thank-you screen; confirmation email is sent when SMTP is configured.

Optional:

```text
NEXT_PUBLIC_MARKETING_URL=https://physicalrisk.com
LEAD_NOTIFY_EMAIL=ops@physicalrisk.com
```

## Public APIs

- `GET /api/public/questionnaire/SCLI` — published methodology (no risk scores exposed)
- `POST /api/public/leads` — capture lead + draft assessment at start
- `POST /api/public/complete-assessment` — save answers, evaluate, thank-you email
