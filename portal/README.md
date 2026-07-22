# Physical Risk Portal

Application launcher for the Physical Risk platform. Provides SSO login via Keycloak and presents application cards for MOSS and Enterprise Repository.

## Tech Stack

- **Framework**: Next.js 14 (React 18)
- **Auth**: NextAuth.js v4 with Keycloak OIDC (Authorization Code + PKCE)
- **Styling**: Tailwind CSS
- **Icons**: Lucide React

## Development

```bash
cd portal
cp .env.example .env.local
npm install
npm run dev
```

Requires Keycloak running at `http://auth.localhost`.

## Environment Variables

See `.env.example` for all required variables.
