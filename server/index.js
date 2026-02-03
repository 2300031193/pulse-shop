require('dotenv').config();
const path = require('path');
const crypto = require('crypto');
const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const { db, init } = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;

init();

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'client')));

function requireAdmin(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Missing token.' });

  const now = new Date().toISOString();
  const session = db.prepare(
    `SELECT s.token, s.user_id, s.expires_at, u.email
     FROM admin_sessions s
     JOIN users u ON u.id = s.user_id
     WHERE s.token = ? AND s.expires_at > ?`
  ).get(token, now);

  if (!session) return res.status(401).json({ error: 'Unauthorized.' });

  req.admin = { id: session.user_id, email: session.email };
  return next();
}

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.get('/api/metrics', (req, res) => {
  const productCount = db.prepare('SELECT COUNT(*) as count FROM products').get().count;
  const stockCount = db.prepare('SELECT COALESCE(SUM(stock), 0) as count FROM products').get().count;
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const orderCount = db.prepare('SELECT COUNT(*) as count FROM orders WHERE created_at >= ?').get(since).count;
  res.json({ product_count: productCount, stock_count: stockCount, order_count: orderCount });
});

app.get('/api/products', (req, res) => {
  const products = db.prepare('SELECT * FROM products ORDER BY created_at DESC').all();
  res.json(products);
});

app.get('/api/products/:id', (req, res) => {
  const product = db.prepare('SELECT * FROM products WHERE id = ?').get(req.params.id);
  if (!product) return res.status(404).json({ error: 'Product not found.' });
  return res.json(product);
});

app.post('/api/orders', (req, res) => {
  const { name, email, items } = req.body;

  if (!name || !email || !Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'Invalid order payload.' });
  }

  const now = new Date().toISOString();
  const getProduct = db.prepare('SELECT id, price_cents, stock FROM products WHERE id = ?');
  const updateStock = db.prepare('UPDATE products SET stock = stock - ? WHERE id = ? AND stock >= ?');
  const insertOrder = db.prepare(
    'INSERT INTO orders (customer_name, email, total_cents, status, created_at) VALUES (?, ?, ?, ?, ?)'
  );
  const insertItem = db.prepare(
    'INSERT INTO order_items (order_id, product_id, quantity, price_cents) VALUES (?, ?, ?, ?)'
  );

  const createOrder = db.transaction(() => {
    let total = 0;
    const normalizedItems = [];

    items.forEach((item) => {
      const productId = Number(item.productId);
      const quantity = Number(item.quantity);

      if (!Number.isInteger(productId) || !Number.isInteger(quantity) || quantity <= 0) {
        throw new Error('Invalid item payload.');
      }

      const product = getProduct.get(productId);
      if (!product) throw new Error('Product not found.');

      const update = updateStock.run(quantity, productId, quantity);
      if (update.changes === 0) throw new Error('Insufficient stock for one of the items.');

      total += product.price_cents * quantity;
      normalizedItems.push({ productId, quantity, price_cents: product.price_cents });
    });

    const orderResult = insertOrder.run(name, email, total, 'placed', now);
    const orderId = orderResult.lastInsertRowid;

    normalizedItems.forEach((item) => {
      insertItem.run(orderId, item.productId, item.quantity, item.price_cents);
    });

    return { orderId, total };
  });

  try {
    const result = createOrder();
    return res.json({ order_id: result.orderId, total_cents: result.total });
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }
});

app.post('/api/admin/login', (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email and password required.' });

  const user = db.prepare('SELECT * FROM users WHERE email = ? AND role = ?').get(email, 'admin');
  if (!user) return res.status(401).json({ error: 'Invalid credentials.' });

  const ok = bcrypt.compareSync(password, user.password_hash);
  if (!ok) return res.status(401).json({ error: 'Invalid credentials.' });

  const token = crypto.randomBytes(24).toString('hex');
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  const createdAt = new Date().toISOString();

  db.prepare(
    'INSERT INTO admin_sessions (token, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)'
  ).run(token, user.id, expiresAt, createdAt);

  return res.json({ token, user: { id: user.id, email: user.email } });
});

app.get('/api/admin/products', requireAdmin, (req, res) => {
  const products = db.prepare('SELECT * FROM products ORDER BY created_at DESC').all();
  res.json(products);
});

app.post('/api/admin/products', requireAdmin, (req, res) => {
  const { name, description, price, stock, image_url, category } = req.body;

  if (!name || !description || !image_url || !category) {
    return res.status(400).json({ error: 'Missing product fields.' });
  }

  const priceNumber = Number(price);
  const stockNumber = Number(stock);

  if (!Number.isFinite(priceNumber) || !Number.isFinite(stockNumber) || stockNumber < 0 || priceNumber < 0) {
    return res.status(400).json({ error: 'Invalid price or stock.' });
  }

  const priceCents = Math.round(priceNumber * 100);
  const now = new Date().toISOString();

  const result = db.prepare(
    'INSERT INTO products (name, description, price_cents, image_url, stock, category, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
  ).run(name, description, priceCents, image_url, stockNumber, category, now);

  res.json({ id: result.lastInsertRowid });
});

app.put('/api/admin/products/:id', requireAdmin, (req, res) => {
  const productId = Number(req.params.id);
  if (!Number.isInteger(productId)) return res.status(400).json({ error: 'Invalid product id.' });

  const updates = [];
  const values = [];

  if (req.body.name) {
    updates.push('name = ?');
    values.push(req.body.name);
  }
  if (req.body.description) {
    updates.push('description = ?');
    values.push(req.body.description);
  }
  if (req.body.image_url) {
    updates.push('image_url = ?');
    values.push(req.body.image_url);
  }
  if (req.body.category) {
    updates.push('category = ?');
    values.push(req.body.category);
  }
  if (req.body.price !== undefined) {
    const priceNumber = Number(req.body.price);
    if (!Number.isFinite(priceNumber) || priceNumber < 0) {
      return res.status(400).json({ error: 'Invalid price.' });
    }
    updates.push('price_cents = ?');
    values.push(Math.round(priceNumber * 100));
  }
  if (req.body.stock !== undefined) {
    const stockNumber = Number(req.body.stock);
    if (!Number.isInteger(stockNumber) || stockNumber < 0) {
      return res.status(400).json({ error: 'Invalid stock.' });
    }
    updates.push('stock = ?');
    values.push(stockNumber);
  }

  if (updates.length === 0) return res.status(400).json({ error: 'No updates provided.' });

  values.push(productId);
  const result = db.prepare(`UPDATE products SET ${updates.join(', ')} WHERE id = ?`).run(...values);

  if (result.changes === 0) return res.status(404).json({ error: 'Product not found.' });
  return res.json({ status: 'ok' });
});

app.delete('/api/admin/products/:id', requireAdmin, (req, res) => {
  const productId = Number(req.params.id);
  if (!Number.isInteger(productId)) return res.status(400).json({ error: 'Invalid product id.' });

  const result = db.prepare('DELETE FROM products WHERE id = ?').run(productId);
  if (result.changes === 0) return res.status(404).json({ error: 'Product not found.' });
  return res.json({ status: 'deleted' });
});

app.get('/api/admin/orders', requireAdmin, (req, res) => {
  const orders = db.prepare('SELECT * FROM orders ORDER BY created_at DESC LIMIT 50').all();
  if (orders.length === 0) return res.json([]);

  const orderIds = orders.map((order) => order.id);
  const placeholders = orderIds.map(() => '?').join(',');
  const items = db.prepare(
    `SELECT oi.order_id, oi.quantity, oi.price_cents, p.name
     FROM order_items oi
     JOIN products p ON p.id = oi.product_id
     WHERE oi.order_id IN (${placeholders})`
  ).all(...orderIds);

  const itemsByOrder = new Map();
  items.forEach((item) => {
    if (!itemsByOrder.has(item.order_id)) itemsByOrder.set(item.order_id, []);
    itemsByOrder.get(item.order_id).push(item);
  });

  const payload = orders.map((order) => ({
    ...order,
    items: itemsByOrder.get(order.id) || []
  }));

  return res.json(payload);
});

app.get(/^(?!\/api).*/, (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'client', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Pulse Shop running on http://localhost:${PORT}`);
});
