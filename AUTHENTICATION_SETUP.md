# Veylo authentication setup

The authentication code is complete, but production providers must be configured before real registration can send email or accept Google and Turnstile responses. Copy the variable names from `server/.env.example` and `client/.env.example`. Never commit their real values.

## MongoDB Atlas

Create the `veylo` database and place its connection string in `MONGODB_URI`. Give the application database user only the permissions needed for this database. MongoDB stores account data, OTP digests, sessions and onboarding answers. It does not store uploaded images.

## Resend

Verify `veylo.com.ng`, including the SPF and DKIM records Resend provides. Add DMARC to the Veylo domain. Create a restricted API key and configure:

- `RESEND_API_KEY`
- `RESEND_FROM_EMAIL=Veylo <info@veylo.com.ng>`

## Cloudflare Turnstile

Create a Managed widget for the production and local development hostnames. Use interaction-only appearance. Configure its public site key in `VITE_TURNSTILE_SITE_KEY` and keep `TURNSTILE_SECRET_KEY` on the server.

## Google Identity Services

Create a Web OAuth client. Add the exact production and local frontend origins to Authorized JavaScript origins. Use the same client ID for `GOOGLE_CLIENT_ID` and `VITE_GOOGLE_CLIENT_ID`. The client secret is not needed for the ID-token button flow used here.

## Cloudflare R2

Create a private R2 bucket and a bucket-scoped S3 API token. Configure `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY` and `R2_BUCKET_NAME` on the server. Keep the bucket private; Veylo serves profile images through the API and signs private media requests. Never put the access key or secret in Vite variables. See [the R2 storage setup](server/docs/r2-storage-setup.md) for the bucket CORS policy and one-time move from Cloudinary.

## Application secrets and cookies

Generate separate random values of at least 32 bytes for `JWT_SECRET` and `OTP_SECRET`. For production on Veylo subdomains, set `COOKIE_DOMAIN=.veylo.com.ng`, keep `COOKIE_SAME_SITE=lax`, and serve both the site and API through HTTPS.

Set `CLIENT_URL` to the public frontend origin and list any additional exact frontend origins in `ALLOWED_ORIGINS`, separated by commas. Do not use wildcard origins with credentialed requests.
