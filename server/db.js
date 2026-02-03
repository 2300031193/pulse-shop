const path = require('path');
const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');

const dbFile = path.join(__dirname, 'data.db');
const db = new Database(dbFile);

db.pragma('journal_mode = WAL');

function init() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS products (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      description TEXT NOT NULL,
      price_cents INTEGER NOT NULL,
      image_url TEXT NOT NULL,
      stock INTEGER NOT NULL,
      category TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      customer_name TEXT NOT NULL,
      email TEXT NOT NULL,
      total_cents INTEGER NOT NULL,
      status TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS order_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id INTEGER NOT NULL,
      product_id INTEGER NOT NULL,
      quantity INTEGER NOT NULL,
      price_cents INTEGER NOT NULL,
      FOREIGN KEY(order_id) REFERENCES orders(id),
      FOREIGN KEY(product_id) REFERENCES products(id)
    );

    CREATE TABLE IF NOT EXISTS admin_sessions (
      token TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY(user_id) REFERENCES users(id)
    );
  `);

  seedAdmin();
  seedProducts();
}

function seedAdmin() {
  const adminEmail = process.env.ADMIN_EMAIL || 'admin@example.com';
  const adminPassword = process.env.ADMIN_PASSWORD || 'admin123';

  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(adminEmail);
  if (existing) return;

  const passwordHash = bcrypt.hashSync(adminPassword, 10);
  const now = new Date().toISOString();

  db.prepare(
    'INSERT INTO users (email, password_hash, role, created_at) VALUES (?, ?, ?, ?)'
  ).run(adminEmail, passwordHash, 'admin', now);
}

function seedProducts() {
  const count = db.prepare('SELECT COUNT(*) as count FROM products').get().count;
  if (count > 0) return;

  const now = new Date().toISOString();
  const products = [
    {
      name: 'Aurora Hoodie',
      description: 'Soft brushed fleece hoodie with structured seams and a matte finish.',
      price_cents: 6500,
      image_url: 'https://picsum.photos/seed/hoodie/600/600',
      stock: 18,
      category: 'Apparel'
    },
    {
      name: 'Glass Lantern',
      description: 'Hand-blown glass lantern with warm light diffusion for calm evenings.',
      price_cents: 8200,
      image_url: 'https://picsum.photos/seed/lantern/600/600',
      stock: 11,
      category: 'Home'
    },
    {
      name: 'Dune Carryall',
      description: 'Waxed canvas tote with reinforced straps and interior organizers.',
      price_cents: 5400,
      image_url: 'https://picsum.photos/seed/tote/600/600',
      stock: 20,
      category: 'Accessories'
    },
    {
      name: 'Studio Mug Set',
      description: 'Stackable ceramic mugs with a satin glaze and heat-safe silhouette.',
      price_cents: 3200,
      image_url: 'https://picsum.photos/seed/mug/600/600',
      stock: 30,
      category: 'Kitchen'
    },
    {
      name: 'Signal Headphones',
      description: 'Wireless over-ear headphones tuned for crisp highs and deep lows.',
      price_cents: 12900,
      image_url: 'https://picsum.photos/seed/headphones/600/600',
      stock: 9,
      category: 'Tech'
    },
    {
      name: 'Arc Desk Lamp',
      description: 'Minimalist desk lamp with adjustable arm and warm LED glow.',
      price_cents: 7600,
      image_url: 'https://picsum.photos/seed/lamp/600/600',
      stock: 13,
      category: 'Home'
    },
    {
      name: 'Terra Sneakers',
      description: 'Lightweight sneakers crafted with breathable knit and soft cushioning.',
      price_cents: 9800,
      image_url: 'https://picsum.photos/seed/sneakers/600/600',
      stock: 14,
      category: 'Footwear'
    },
    {
      name: 'Focus Notebook',
      description: 'Hardcover notebook with dot grid pages and linen-bound spine.',
      price_cents: 2400,
      image_url: 'https://picsum.photos/seed/notebook/600/600',
      stock: 40,
      category: 'Stationery'
    }
  ];

  const insert = db.prepare(
    'INSERT INTO products (name, description, price_cents, image_url, stock, category, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
  );

  const insertMany = db.transaction((rows) => {
    rows.forEach((product) => {
      insert.run(
        product.name,
        product.description,
        product.price_cents,
        product.image_url,
        product.stock,
        product.category,
        now
      );
    });
  });

  insertMany(products);
}

module.exports = { db, init };
