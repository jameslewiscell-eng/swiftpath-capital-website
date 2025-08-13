# SwiftPath Capital — HubSpot-Integrated Site

This bundle posts form submissions directly to HubSpot using the Forms API.

## Configure
1) In HubSpot, create **two forms** (Marketing → Forms):
   - **Lead Capture (Website)** — fields:
     - full_name (Single-line text, internal name: `full_name`)
     - email (Email, internal name: `email`)
     - phone (Phone Number, internal name: `phone`)
     - loan_purpose (Single-line text, internal: `loan_purpose`)
     - (optional) utm_source, utm_medium, utm_campaign, utm_term, utm_content (all single-line text)
   - **Loan Application (Website)** — fields:
     - full_name (`full_name`)
     - email (`email`)
     - phone (`phone`)
     - mailing_address (`mailing_address`)
     - business_name (`business_name`)
     - business_type (`business_type`)
     - annual_revenue (`annual_revenue`)
     - credit_score_range (`credit_score_range`)
     - property_address (`property_address`)
     - requested_loan_amount (`requested_loan_amount`)
     - loan_purpose (`loan_purpose`)
     - loan_details (`loan_details`)
     - (optional) utm_* properties as above

> Tip: When creating new fields in HubSpot, ensure the **internal name** matches what’s in parentheses.

2) After each form is created, copy its **Form GUID** from the form details page.

3) Open:
   - `index.html`: set `window.HUBSPOT_LEAD_GUID = 'YOUR_LEAD_FORM_GUID'`
   - `LoanApp.html`: set `window.HUBSPOT_LOAN_GUID = 'YOUR_LOAN_FORM_GUID'`
   The Portal ID is already set to `243569048`.

4) Deploy to Netlify (or any static host).

## Notes
- We include UTM parameters (source/medium/campaign/term/content) and HubSpot context (page URL, name, `hubspotutk` cookie) with each submission.
- File uploads: HubSpot’s Forms API requires uploading files to a publicly accessible URL first. To keep things simple for launch, the current application form **does not upload files**. After go-live, we can add a Netlify Function that accepts file uploads, stores them temporarily (e.g., AWS S3), then passes the URLs into HubSpot submissions.
- If you prefer **embedded HubSpot forms**, you can replace our custom forms with the HubSpot embed code. Our approach gives you full design control while still creating/associating contacts in HubSpot.

## Optional: Create forms via API (advanced)
If you have a HubSpot Private App token, you can programmatically create the two forms and properties. See `hubspot-forms.sample.json` for the field list you can import or recreate.

