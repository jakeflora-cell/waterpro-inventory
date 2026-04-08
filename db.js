const Database = require('better-sqlite3');
const path = require('path');

// Use DATA_DIR env var for persistent storage (Railway volume mount), fallback to app dir
const DATA_DIR = process.env.DATA_DIR || __dirname;
const DB_PATH = path.join(DATA_DIR, 'inventory.db');
const db = new Database(DB_PATH);

// Enable WAL mode for better concurrent read performance
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// ─── Schema ───
db.exec(`
  CREATE TABLE IF NOT EXISTS employees (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    pin TEXT NOT NULL,
    role TEXT DEFAULT 'tech',  -- tech | supervisor | admin
    active INTEGER DEFAULT 1,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sku TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    category TEXT NOT NULL DEFAULT 'consumable',  -- consumable | tool
    unit_cost REAL DEFAULT 0,
    unit_of_measure TEXT DEFAULT 'each',  -- each | box | roll | gallon | bag | sheet | pair
    current_quantity REAL DEFAULT 0,
    reorder_threshold REAL DEFAULT 5,
    location TEXT DEFAULT '',  -- shelf/bin location in warehouse
    notes TEXT DEFAULT '',
    active INTEGER DEFAULT 1,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS checkouts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    item_id INTEGER NOT NULL,
    employee_id INTEGER NOT NULL,
    job_number TEXT NOT NULL,        -- Albi project ID
    job_name TEXT DEFAULT '',        -- cached job name from Albi
    quantity REAL NOT NULL,
    unit_cost_at_time REAL NOT NULL, -- snapshot cost at checkout time
    total_cost REAL NOT NULL,
    checkout_date TEXT DEFAULT (datetime('now')),
    return_date TEXT,                -- null if consumable or not returned
    status TEXT DEFAULT 'consumed',  -- consumed | checked_out | returned
    albi_note_posted INTEGER DEFAULT 0,  -- 1 if CreateNote succeeded
    albi_note_id TEXT DEFAULT '',
    notes TEXT DEFAULT '',
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (item_id) REFERENCES items(id),
    FOREIGN KEY (employee_id) REFERENCES employees(id)
  );

  CREATE TABLE IF NOT EXISTS restocks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    item_id INTEGER NOT NULL,
    employee_id INTEGER,
    quantity_added REAL NOT NULL,
    purchase_cost REAL DEFAULT 0,
    vendor TEXT DEFAULT '',
    receipt_ref TEXT DEFAULT '',
    notes TEXT DEFAULT '',
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (item_id) REFERENCES items(id)
  );

  CREATE TABLE IF NOT EXISTS albi_projects_cache (
    project_id TEXT PRIMARY KEY,
    project_name TEXT,
    address TEXT DEFAULT '',
    status TEXT DEFAULT '',
    customer_name TEXT DEFAULT '',
    cached_at TEXT DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_checkouts_item ON checkouts(item_id);
  CREATE INDEX IF NOT EXISTS idx_checkouts_employee ON checkouts(employee_id);
  CREATE INDEX IF NOT EXISTS idx_checkouts_job ON checkouts(job_number);
  CREATE INDEX IF NOT EXISTS idx_checkouts_date ON checkouts(checkout_date);
  CREATE INDEX IF NOT EXISTS idx_items_sku ON items(sku);
  CREATE INDEX IF NOT EXISTS idx_items_category ON items(category);
`);

// ─── Prepared Statements ───

const queries = {
  // Items
  getAllItems: db.prepare('SELECT * FROM items WHERE active = 1 ORDER BY category, name'),
  getItemBySku: db.prepare('SELECT * FROM items WHERE sku = ? AND active = 1'),
  getItemById: db.prepare('SELECT * FROM items WHERE id = ? AND active = 1'),
  getLowStockItems: db.prepare('SELECT * FROM items WHERE active = 1 AND current_quantity <= reorder_threshold ORDER BY current_quantity ASC'),

  createItem: db.prepare(`
    INSERT INTO items (sku, name, category, unit_cost, unit_of_measure, current_quantity, reorder_threshold, location, notes)
    VALUES (@sku, @name, @category, @unit_cost, @unit_of_measure, @current_quantity, @reorder_threshold, @location, @notes)
  `),

  updateItemQuantity: db.prepare('UPDATE items SET current_quantity = current_quantity + ?, updated_at = datetime(\'now\') WHERE id = ?'),

  updateItem: db.prepare(`
    UPDATE items SET name = @name, sku = @sku, category = @category, unit_cost = @unit_cost,
    unit_of_measure = @unit_of_measure, current_quantity = @current_quantity,
    reorder_threshold = @reorder_threshold,
    location = @location, notes = @notes, updated_at = datetime('now')
    WHERE id = @id
  `),

  deleteItem: db.prepare('UPDATE items SET active = 0, updated_at = datetime(\'now\') WHERE id = ?'),

  // Employees
  getAllEmployees: db.prepare('SELECT id, name, role, active FROM employees WHERE active = 1 ORDER BY name'),
  getEmployeeByPin: db.prepare('SELECT * FROM employees WHERE pin = ? AND active = 1'),
  getEmployeeById: db.prepare('SELECT * FROM employees WHERE id = ? AND active = 1'),

  createEmployee: db.prepare(`
    INSERT INTO employees (name, pin, role) VALUES (@name, @pin, @role)
  `),

  // Checkouts
  createCheckout: db.prepare(`
    INSERT INTO checkouts (item_id, employee_id, job_number, job_name, quantity, unit_cost_at_time, total_cost, status, notes)
    VALUES (@item_id, @employee_id, @job_number, @job_name, @quantity, @unit_cost_at_time, @total_cost, @status, @notes)
  `),

  getRecentCheckouts: db.prepare(`
    SELECT c.*, i.name as item_name, i.sku, i.unit_of_measure, e.name as employee_name
    FROM checkouts c
    JOIN items i ON c.item_id = i.id
    JOIN employees e ON c.employee_id = e.id
    ORDER BY c.created_at DESC
    LIMIT ?
  `),

  getCheckoutsByJob: db.prepare(`
    SELECT c.*, i.name as item_name, i.sku, i.unit_of_measure, e.name as employee_name
    FROM checkouts c
    JOIN items i ON c.item_id = i.id
    JOIN employees e ON c.employee_id = e.id
    WHERE c.job_number = ?
    ORDER BY c.created_at DESC
  `),

  getCheckoutsByEmployee: db.prepare(`
    SELECT c.*, i.name as item_name, i.sku, i.unit_of_measure, e.name as employee_name
    FROM checkouts c
    JOIN items i ON c.item_id = i.id
    JOIN employees e ON c.employee_id = e.id
    WHERE c.employee_id = ?
    ORDER BY c.created_at DESC
    LIMIT ?
  `),

  getCheckedOutTools: db.prepare(`
    SELECT c.*, i.name as item_name, i.sku, e.name as employee_name
    FROM checkouts c
    JOIN items i ON c.item_id = i.id
    JOIN employees e ON c.employee_id = e.id
    WHERE c.status = 'checked_out'
    ORDER BY c.checkout_date ASC
  `),

  returnTool: db.prepare(`
    UPDATE checkouts SET status = 'returned', return_date = datetime('now') WHERE id = ? AND status = 'checked_out'
  `),

  markAlbiNotePosted: db.prepare(`
    UPDATE checkouts SET albi_note_posted = 1 WHERE id = ?
  `),

  // Restocks
  createRestock: db.prepare(`
    INSERT INTO restocks (item_id, employee_id, quantity_added, purchase_cost, vendor, receipt_ref, notes)
    VALUES (@item_id, @employee_id, @quantity_added, @purchase_cost, @vendor, @receipt_ref, @notes)
  `),

  getRestockHistory: db.prepare(`
    SELECT r.*, i.name as item_name, i.sku, e.name as employee_name
    FROM restocks r
    JOIN items i ON r.item_id = i.id
    LEFT JOIN employees e ON r.employee_id = e.id
    ORDER BY r.created_at DESC
    LIMIT ?
  `),

  // Albi project cache
  upsertProject: db.prepare(`
    INSERT INTO albi_projects_cache (project_id, project_name, address, status, customer_name, cached_at)
    VALUES (@project_id, @project_name, @address, @status, @customer_name, datetime('now'))
    ON CONFLICT(project_id) DO UPDATE SET
      project_name = @project_name, address = @address, status = @status,
      customer_name = @customer_name, cached_at = datetime('now')
  `),

  getCachedProjects: db.prepare('SELECT * FROM albi_projects_cache ORDER BY project_name'),
  getCachedProject: db.prepare('SELECT * FROM albi_projects_cache WHERE project_id = ?'),

  // Reports
  costByJob: db.prepare(`
    SELECT job_number, job_name,
           SUM(total_cost) as total_materials_cost,
           COUNT(*) as checkout_count
    FROM checkouts
    WHERE checkout_date >= ? AND checkout_date <= ?
    GROUP BY job_number
    ORDER BY total_materials_cost DESC
  `),

  costByCategory: db.prepare(`
    SELECT i.category, SUM(c.total_cost) as total_cost, COUNT(*) as count
    FROM checkouts c JOIN items i ON c.item_id = i.id
    WHERE c.checkout_date >= ? AND c.checkout_date <= ?
    GROUP BY i.category
  `),

  costByEmployee: db.prepare(`
    SELECT e.name as employee_name, SUM(c.total_cost) as total_cost, COUNT(*) as count
    FROM checkouts c JOIN employees e ON c.employee_id = e.id
    WHERE c.checkout_date >= ? AND c.checkout_date <= ?
    GROUP BY c.employee_id
    ORDER BY total_cost DESC
  `),

  topItems: db.prepare(`
    SELECT i.name, i.sku, SUM(c.quantity) as total_qty, SUM(c.total_cost) as total_cost
    FROM checkouts c JOIN items i ON c.item_id = i.id
    WHERE c.checkout_date >= ? AND c.checkout_date <= ?
    GROUP BY c.item_id
    ORDER BY total_cost DESC
    LIMIT 20
  `),
};

// ─── Transaction helpers ───

const checkoutTransaction = db.transaction((data) => {
  const item = queries.getItemById.get(data.item_id);
  if (!item) throw new Error('Item not found');

  // For consumables, check stock
  if (item.category === 'consumable' && item.current_quantity < data.quantity) {
    throw new Error(`Insufficient stock. Available: ${item.current_quantity} ${item.unit_of_measure}`);
  }

  const checkout = queries.createCheckout.run({
    ...data,
    unit_cost_at_time: item.unit_cost,
    total_cost: item.unit_cost * data.quantity,
    status: item.category === 'tool' ? 'checked_out' : 'consumed',
  });

  // Decrement stock for consumables
  if (item.category === 'consumable') {
    queries.updateItemQuantity.run(-data.quantity, data.item_id);
  }

  return {
    checkout_id: checkout.lastInsertRowid,
    item_name: item.name,
    item_sku: item.sku,
    unit_cost: item.unit_cost,
    total_cost: item.unit_cost * data.quantity,
    category: item.category,
    remaining_stock: item.category === 'consumable' ? item.current_quantity - data.quantity : null,
  };
});

const restockTransaction = db.transaction((data) => {
  const restock = queries.createRestock.run(data);
  queries.updateItemQuantity.run(data.quantity_added, data.item_id);
  const item = queries.getItemById.get(data.item_id);
  return {
    restock_id: restock.lastInsertRowid,
    new_quantity: item.current_quantity,
  };
});

const returnToolTransaction = db.transaction((checkoutId) => {
  const result = queries.returnTool.run(checkoutId);
  if (result.changes === 0) throw new Error('Checkout not found or already returned');
  return { returned: true };
});

module.exports = { db, queries, checkoutTransaction, restockTransaction, returnToolTransaction };
