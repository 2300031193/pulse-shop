# Pulse Shop

A full-stack ecommerce starter built with Node.js, Express, SQLite, and a custom vanilla frontend.

## Run locally

1. Install dependencies:

```bash
npm install
```

2. Start the server:

```bash
npm start
```

3. Open `http://localhost:3000` in your browser.

## Admin access

Default credentials (override in `.env`):

- Email: `admin@example.com`
- Password: `admin123`

Create a `.env` file if you want custom credentials:

```bash
PORT=3000
ADMIN_EMAIL=admin@example.com
ADMIN_PASSWORD=admin123
```

## Database

SQLite database lives at `server/data.db` and is created automatically on first run.
