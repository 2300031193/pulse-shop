const state = {
  products: [],
  cart: loadCart(),
  adminToken: localStorage.getItem('adminToken')
};

const elements = {
  productGrid: document.getElementById('product-grid'),
  cartItems: document.getElementById('cart-items'),
  cartTotal: document.getElementById('cart-total'),
  cartCount: document.getElementById('cart-count'),
  checkoutForm: document.getElementById('checkout-form'),
  checkoutMessage: document.getElementById('checkout-message'),
  stockCount: document.getElementById('stock-count'),
  productCount: document.getElementById('product-count'),
  orderCount: document.getElementById('order-count'),
  navButtons: document.querySelectorAll('.nav-btn'),
  storeView: document.getElementById('store-view'),
  adminView: document.getElementById('admin-view'),
  scrollToProducts: document.getElementById('scroll-to-products'),
  clearCart: document.getElementById('clear-cart'),
  adminLoginForm: document.getElementById('admin-login-form'),
  adminLoginMessage: document.getElementById('admin-login-message'),
  adminLoginCard: document.getElementById('admin-login-card'),
  adminPanel: document.getElementById('admin-panel'),
  adminLogout: document.getElementById('admin-logout'),
  adminProductForm: document.getElementById('admin-product-form'),
  adminProductMessage: document.getElementById('admin-product-message'),
  adminProductList: document.getElementById('admin-product-list'),
  adminOrderList: document.getElementById('admin-order-list'),
  adminRefreshProducts: document.getElementById('admin-refresh-products'),
  adminRefreshOrders: document.getElementById('admin-refresh-orders')
};

function loadCart() {
  try {
    const raw = localStorage.getItem('cart');
    return raw ? JSON.parse(raw) : [];
  } catch (error) {
    return [];
  }
}

function saveCart() {
  localStorage.setItem('cart', JSON.stringify(state.cart));
}

function formatMoney(cents) {
  return `$${(cents / 100).toFixed(2)}`;
}

function createEl(tag, className, text) {
  const el = document.createElement(tag);
  if (className) el.className = className;
  if (text !== undefined) el.textContent = text;
  return el;
}

function setView(viewId) {
  document.querySelectorAll('.view').forEach((view) => {
    view.classList.toggle('active', view.id === viewId);
  });
  elements.navButtons.forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.view === viewId);
  });
}

function getProduct(productId) {
  return state.products.find((product) => product.id === productId);
}

function addToCart(productId) {
  const product = getProduct(productId);
  if (!product || product.stock <= 0) return;

  const existing = state.cart.find((item) => item.productId === productId);
  if (existing) {
    if (existing.quantity >= product.stock) return;
    existing.quantity += 1;
  } else {
    state.cart.push({ productId, quantity: 1 });
  }
  saveCart();
  renderCart();
}

function updateCartItem(productId, delta) {
  const item = state.cart.find((entry) => entry.productId === productId);
  if (!item) return;

  const product = getProduct(productId);
  if (!product) return;

  const nextQty = item.quantity + delta;
  if (nextQty <= 0) {
    state.cart = state.cart.filter((entry) => entry.productId !== productId);
  } else if (nextQty <= product.stock) {
    item.quantity = nextQty;
  }

  saveCart();
  renderCart();
}

function renderProducts() {
  elements.productGrid.innerHTML = '';
  state.products.forEach((product, index) => {
    const card = createEl('article', 'product-card');
    card.style.animationDelay = `${index * 60}ms`;

    const media = createEl('div', 'product-media');
    media.style.backgroundImage = `url('${product.image_url}')`;

    const body = createEl('div', 'product-body');
    const row = createEl('div', 'product-row');
    const name = createEl('h3', null, product.name);
    const price = createEl('span', 'price', formatMoney(product.price_cents));
    row.appendChild(name);
    row.appendChild(price);

    const category = createEl('span', 'badge', product.category);
    const description = createEl('p', 'sub', product.description);
    const stock = createEl('span', 'hint', `${product.stock} in stock`);

    const button = createEl('button', 'primary', product.stock > 0 ? 'Add to cart' : 'Sold out');
    button.disabled = product.stock <= 0;
    button.addEventListener('click', () => addToCart(product.id));

    body.appendChild(row);
    body.appendChild(category);
    body.appendChild(description);
    body.appendChild(stock);
    body.appendChild(button);

    card.appendChild(media);
    card.appendChild(body);
    elements.productGrid.appendChild(card);
  });
}

function renderCart() {
  elements.cartItems.innerHTML = '';
  let total = 0;
  let count = 0;

  state.cart.forEach((item) => {
    const product = getProduct(item.productId);
    if (!product) return;

    count += item.quantity;
    total += product.price_cents * item.quantity;

    const row = createEl('div', 'cart-item');
    const title = createEl('strong', null, product.name);
    const price = createEl('span', 'hint', `${formatMoney(product.price_cents)} each`);

    const actions = createEl('div', 'cart-actions');
    const minus = createEl('button', null, '-');
    const qty = createEl('span', null, `Qty ${item.quantity}`);
    const plus = createEl('button', null, '+');
    plus.disabled = item.quantity >= product.stock;

    minus.addEventListener('click', () => updateCartItem(product.id, -1));
    plus.addEventListener('click', () => updateCartItem(product.id, 1));

    actions.appendChild(minus);
    actions.appendChild(qty);
    actions.appendChild(plus);

    row.appendChild(title);
    row.appendChild(price);
    row.appendChild(actions);
    elements.cartItems.appendChild(row);
  });

  elements.cartTotal.textContent = formatMoney(total);
  elements.cartCount.textContent = `${count} item${count === 1 ? '' : 's'}`;

  if (state.cart.length === 0) {
    elements.cartItems.appendChild(createEl('p', 'hint', 'Your cart is empty.'));
  }
}

async function fetchProducts() {
  const res = await fetch('/api/products');
  state.products = await res.json();
  renderProducts();
  renderCart();
}

async function fetchMetrics() {
  const res = await fetch('/api/metrics');
  const data = await res.json();
  elements.stockCount.textContent = data.stock_count;
  elements.productCount.textContent = data.product_count;
  elements.orderCount.textContent = data.order_count;
}

async function handleCheckout(event) {
  event.preventDefault();
  if (state.cart.length === 0) {
    elements.checkoutMessage.textContent = 'Add at least one item to checkout.';
    return;
  }

  const formData = new FormData(elements.checkoutForm);
  const payload = {
    name: formData.get('name'),
    email: formData.get('email'),
    items: state.cart.map((item) => ({
      productId: item.productId,
      quantity: item.quantity
    }))
  };

  elements.checkoutMessage.textContent = 'Processing order...';

  try {
    const res = await fetch('/api/orders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Unable to place order.');
    }

    elements.checkoutMessage.textContent = `Order #${data.order_id} placed!`;
    state.cart = [];
    saveCart();
    elements.checkoutForm.reset();
    await fetchProducts();
    await fetchMetrics();
  } catch (error) {
    elements.checkoutMessage.textContent = error.message;
  }
}

function setAdminLoggedIn(isLoggedIn) {
  elements.adminLoginCard.classList.toggle('hidden', isLoggedIn);
  elements.adminPanel.classList.toggle('hidden', !isLoggedIn);
}

async function adminFetch(path, options = {}) {
  if (!state.adminToken) throw new Error('Missing token');
  const res = await fetch(path, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${state.adminToken}`,
      ...(options.headers || {})
    }
  });

  if (res.status === 401) {
    logoutAdmin();
    throw new Error('Unauthorized. Please log in again.');
  }

  return res;
}

async function loginAdmin(event) {
  event.preventDefault();
  const formData = new FormData(elements.adminLoginForm);
  elements.adminLoginMessage.textContent = 'Signing in...';

  try {
    const res = await fetch('/api/admin/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: formData.get('email'),
        password: formData.get('password')
      })
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Login failed.');
    }

    state.adminToken = data.token;
    localStorage.setItem('adminToken', state.adminToken);
    elements.adminLoginMessage.textContent = '';
    setAdminLoggedIn(true);
    await loadAdminData();
  } catch (error) {
    elements.adminLoginMessage.textContent = error.message;
  }
}

function logoutAdmin() {
  state.adminToken = null;
  localStorage.removeItem('adminToken');
  setAdminLoggedIn(false);
}

async function createProduct(event) {
  event.preventDefault();
  const formData = new FormData(elements.adminProductForm);
  elements.adminProductMessage.textContent = 'Saving product...';

  const payload = {
    name: formData.get('name'),
    category: formData.get('category'),
    price: formData.get('price'),
    stock: formData.get('stock'),
    image_url: formData.get('image_url'),
    description: formData.get('description')
  };

  try {
    const res = await adminFetch('/api/admin/products', {
      method: 'POST',
      body: JSON.stringify(payload)
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Unable to create product.');
    }

    elements.adminProductMessage.textContent = 'Product created.';
    elements.adminProductForm.reset();
    await fetchProducts();
    await loadAdminData();
  } catch (error) {
    elements.adminProductMessage.textContent = error.message;
  }
}

async function updateProductStock(productId, stockValue) {
  const stock = Number(stockValue);
  if (!Number.isInteger(stock) || stock < 0) return;

  const res = await adminFetch(`/api/admin/products/${productId}`, {
    method: 'PUT',
    body: JSON.stringify({ stock })
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || 'Update failed.');
  }
}

async function deleteProduct(productId) {
  const res = await adminFetch(`/api/admin/products/${productId}`, { method: 'DELETE' });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || 'Delete failed.');
  }
}

function renderAdminProducts(products) {
  elements.adminProductList.innerHTML = '';
  products.forEach((product) => {
    const row = createEl('div', 'list-item');
    const title = createEl('strong', null, product.name);
    const meta = createEl('span', 'hint', `${product.category} • ${formatMoney(product.price_cents)}`);

    const inline = createEl('div', 'inline');
    const stockLabel = createEl('span', null, 'Stock');
    const stockInput = document.createElement('input');
    stockInput.type = 'number';
    stockInput.min = '0';
    stockInput.value = product.stock;
    stockInput.style.width = '90px';

    const updateBtn = createEl('button', 'ghost', 'Update');
    updateBtn.addEventListener('click', async () => {
      try {
        await updateProductStock(product.id, stockInput.value);
        await fetchProducts();
        await fetchMetrics();
      } catch (error) {
        alert(error.message);
      }
    });

    const deleteBtn = createEl('button', 'ghost danger', 'Delete');
    deleteBtn.addEventListener('click', async () => {
      try {
        await deleteProduct(product.id);
        await fetchProducts();
        await loadAdminData();
      } catch (error) {
        alert(error.message);
      }
    });

    inline.appendChild(stockLabel);
    inline.appendChild(stockInput);
    inline.appendChild(updateBtn);
    inline.appendChild(deleteBtn);

    row.appendChild(title);
    row.appendChild(meta);
    row.appendChild(inline);

    elements.adminProductList.appendChild(row);
  });
}

function renderAdminOrders(orders) {
  elements.adminOrderList.innerHTML = '';
  if (orders.length === 0) {
    elements.adminOrderList.appendChild(createEl('p', 'hint', 'No orders yet.'));
    return;
  }

  orders.forEach((order) => {
    const card = createEl('div', 'list-item');
    const header = createEl('strong', null, `Order #${order.id}`);
    const meta = createEl('span', 'hint', `${order.customer_name} • ${order.email} • ${formatMoney(order.total_cents)}`);

    const items = createEl('div', 'inline');
    order.items.forEach((item) => {
      const badge = createEl('span', 'badge', `${item.name} x${item.quantity}`);
      items.appendChild(badge);
    });

    card.appendChild(header);
    card.appendChild(meta);
    card.appendChild(items);
    elements.adminOrderList.appendChild(card);
  });
}

async function loadAdminData() {
  const productsRes = await adminFetch('/api/admin/products');
  const products = await productsRes.json();
  renderAdminProducts(products);

  const ordersRes = await adminFetch('/api/admin/orders');
  const orders = await ordersRes.json();
  renderAdminOrders(orders);
}

function bindEvents() {
  elements.navButtons.forEach((btn) => {
    btn.addEventListener('click', () => setView(btn.dataset.view));
  });

  elements.scrollToProducts.addEventListener('click', () => {
    document.getElementById('catalog').scrollIntoView({ behavior: 'smooth' });
  });

  elements.clearCart.addEventListener('click', () => {
    state.cart = [];
    saveCart();
    renderCart();
  });

  elements.checkoutForm.addEventListener('submit', handleCheckout);
  elements.adminLoginForm.addEventListener('submit', loginAdmin);
  elements.adminLogout.addEventListener('click', logoutAdmin);
  elements.adminProductForm.addEventListener('submit', createProduct);
  elements.adminRefreshProducts.addEventListener('click', loadAdminData);
  elements.adminRefreshOrders.addEventListener('click', loadAdminData);
}

async function init() {
  bindEvents();
  await fetchProducts();
  await fetchMetrics();

  if (state.adminToken) {
    setAdminLoggedIn(true);
    try {
      await loadAdminData();
    } catch (error) {
      logoutAdmin();
    }
  }
}

init();
