const express = require('express');
const cors = require('cors');
const path = require('path');
const QRCode = require('qrcode');
const { db, queries, checkoutTransaction, restockTransaction, returnToolTransaction } = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;
const ADMIN_PIN = process.env.ADMIN_PIN || '1234';
const ALBI_API_KEY = process.env.ALBI_API_KEY || '';
const ALBI_BASE_URL = process.env.ALBI_BASE_URL || 'https://api.albiware.com/v5/Integrations';
const SKIP_ALBI = process.env.SKIP_ALBI === 'true';
const BASE_URL = process.env.BASE_URL || `http://localhost:${PORT}`;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ─── Auth middleware ───
function requirePin(req, res, next) {
  const pin = req.headers['x-pin'] || req.query.pin;
  if (!pin) return res.status(401).json({ error: 'PIN required' });
  const employee = queries.getEmployeeByPin.get(pin);
  if (!employee) return res.status(401).json({ error: 'Invalid PIN' });
  req.employee = employee;
  next();
}

function requireAdmin(req, res, next) {
  const pin = req.headers['x-pin'] || req.query.pin;
  if (!pin) return res.status(401).json({ error: 'PIN required' });
  const employee = queries.getEmployeeByPin.get(pin);
  if (!employee) return res.status(401).json({ error: 'Invalid PIN' });
  if (employee.role !== 'admin' && employee.role !== 'supervisor') {
    return res.status(403).json({ error: 'Admin or supervisor access required' });
  }
  req.employee = employee;
  next();
}

// ─── Albi API helper ───
async function albiRequest(method, endpoint, body = null) {
  if (SKIP_ALBI || !ALBI_API_KEY) {
    console.log(`[ALBI SKIP] ${method} ${endpoint}`);
    return null;
  }
  try {
    const opts = {
      method,
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ALBI_API_KEY,
        'Accept': 'application/json',
      },
    };
    if (body) opts.body = JSON.stringify(body);
    const resp = await fetch(`${ALBI_BASE_URL}${endpoint}`, opts);
    if (!resp.ok) {
      console.error(`[ALBI ERROR] ${resp.status} on ${endpoint}`);
      return null;
    }
    return await resp.json();
  } catch (err) {
    console.error(`[ALBI ERROR] ${err.message}`);
    return null;
  }
}

// Post material checkout note to Albi project timeline
async function postCheckoutToAlbi(checkoutId, itemName, quantity, unitCost, totalCost, jobNumber, employeeName) {
  const timestamp = new Date().toLocaleString('en-US', { timeZone: 'America/Chicago' });
  const note = `MATERIAL CHECKOUT: ${quantity}x ${itemName} ($${unitCost.toFixed(2)} ea = $${totalCost.toFixed(2)}) - Checked out by ${employeeName} at ${timestamp}`;

  const result = await albiRequest('POST', '/Projects/CreateNote', {
    projectId: parseInt(jobNumber),
    note: note,
  });

  if (result) {
    queries.markAlbiNotePosted.run(checkoutId);
  }
  return result;
}

// ─── Health check ───
app.get('/api/health', (req, res) => {
  const items = queries.getAllItems.all();
  const lowStock = queries.getLowStockItems.all();
  res.json({
    status: 'ok',
    service: 'WaterPro Inventory',
    items: items.length,
    lowStockAlerts: lowStock.length,
    albiConnected: !SKIP_ALBI && !!ALBI_API_KEY,
  });
});

// ═══════════════════════════════════════
//  AUTH
// ═══════════════════════════════════════

app.post('/api/auth/verify', (req, res) => {
  const { pin } = req.body;
  if (!pin) return res.status(400).json({ error: 'PIN required' });
  const employee = queries.getEmployeeByPin.get(pin);
  if (!employee) return res.status(401).json({ error: 'Invalid PIN' });
  res.json({ id: employee.id, name: employee.name, role: employee.role });
});

// ═══════════════════════════════════════
//  ITEMS
// ═══════════════════════════════════════

app.get('/api/items', requirePin, (req, res) => {
  const items = queries.getAllItems.all();
  res.json(items);
});

app.get('/api/items/:sku', requirePin, (req, res) => {
  const item = queries.getItemBySku.get(req.params.sku);
  if (!item) return res.status(404).json({ error: 'Item not found' });
  res.json(item);
});

app.post('/api/items', requireAdmin, (req, res) => {
  try {
    const result = queries.createItem.run({
      sku: req.body.sku,
      name: req.body.name,
      category: req.body.category || 'consumable',
      unit_cost: req.body.unit_cost || 0,
      unit_of_measure: req.body.unit_of_measure || 'each',
      current_quantity: req.body.current_quantity || 0,
      reorder_threshold: req.body.reorder_threshold || 5,
      location: req.body.location || '',
      notes: req.body.notes || '',
    });
    res.json({ id: result.lastInsertRowid, message: 'Item created' });
  } catch (err) {
    if (err.message.includes('UNIQUE')) {
      return res.status(409).json({ error: 'SKU already exists' });
    }
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/items/:id', requireAdmin, (req, res) => {
  try {
    queries.updateItem.run({
      id: parseInt(req.params.id),
      sku: req.body.sku,
      name: req.body.name,
      category: req.body.category,
      unit_cost: req.body.unit_cost,
      unit_of_measure: req.body.unit_of_measure,
      current_quantity: req.body.current_quantity,
      reorder_threshold: req.body.reorder_threshold,
      location: req.body.location || '',
      notes: req.body.notes || '',
    });
    res.json({ message: 'Item updated' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/items/:id', requireAdmin, (req, res) => {
  try {
    queries.deleteItem.run(parseInt(req.params.id));
    res.json({ message: 'Item deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/items-low-stock', requirePin, (req, res) => {
  res.json(queries.getLowStockItems.all());
});

// ═══════════════════════════════════════
//  CHECKOUT
// ═══════════════════════════════════════

app.post('/api/checkout', requirePin, async (req, res) => {
  try {
    const { item_id, job_number, job_name, quantity, notes } = req.body;

    if (!item_id || !job_number || !quantity || quantity <= 0) {
      return res.status(400).json({ error: 'item_id, job_number, and quantity (> 0) required' });
    }

    const result = checkoutTransaction({
      item_id: parseInt(item_id),
      employee_id: req.employee.id,
      job_number: String(job_number),
      job_name: job_name || '',
      quantity: parseFloat(quantity),
      notes: notes || '',
    });

    // Post to Albi async (don't block the response)
    postCheckoutToAlbi(
      result.checkout_id, result.item_name, quantity,
      result.unit_cost, result.total_cost, job_number, req.employee.name
    ).catch(err => console.error('[ALBI POST ERROR]', err.message));

    res.json({
      message: 'Checkout recorded',
      ...result,
      employee: req.employee.name,
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.get('/api/checkouts/recent', requirePin, (req, res) => {
  const limit = parseInt(req.query.limit) || 50;
  res.json(queries.getRecentCheckouts.all(limit));
});

app.get('/api/checkouts/job/:jobNumber', requirePin, (req, res) => {
  res.json(queries.getCheckoutsByJob.all(req.params.jobNumber));
});

app.get('/api/checkouts/employee/:id', requirePin, (req, res) => {
  const limit = parseInt(req.query.limit) || 50;
  res.json(queries.getCheckoutsByEmployee.all(parseInt(req.params.id), limit));
});

// ═══════════════════════════════════════
//  TOOL CHECKOUT / RETURN
// ═══════════════════════════════════════

app.get('/api/tools/checked-out', requirePin, (req, res) => {
  res.json(queries.getCheckedOutTools.all());
});

app.post('/api/tools/return/:checkoutId', requirePin, (req, res) => {
  try {
    returnToolTransaction(parseInt(req.params.checkoutId));
    res.json({ message: 'Tool returned' });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// ═══════════════════════════════════════
//  RESTOCK
// ═══════════════════════════════════════

app.post('/api/restock', requireAdmin, (req, res) => {
  try {
    const { item_id, quantity_added, purchase_cost, vendor, receipt_ref, notes } = req.body;

    if (!item_id || !quantity_added || quantity_added <= 0) {
      return res.status(400).json({ error: 'item_id and quantity_added (> 0) required' });
    }

    const result = restockTransaction({
      item_id: parseInt(item_id),
      employee_id: req.employee.id,
      quantity_added: parseFloat(quantity_added),
      purchase_cost: parseFloat(purchase_cost) || 0,
      vendor: vendor || '',
      receipt_ref: receipt_ref || '',
      notes: notes || '',
    });

    res.json({ message: 'Restock recorded', ...result });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.get('/api/restocks', requireAdmin, (req, res) => {
  const limit = parseInt(req.query.limit) || 50;
  res.json(queries.getRestockHistory.all(limit));
});

// ═══════════════════════════════════════
//  EMPLOYEES
// ═══════════════════════════════════════

app.get('/api/employees', requireAdmin, (req, res) => {
  res.json(queries.getAllEmployees.all());
});

app.post('/api/employees', requireAdmin, (req, res) => {
  try {
    const result = queries.createEmployee.run({
      name: req.body.name,
      pin: req.body.pin,
      role: req.body.role || 'tech',
    });
    res.json({ id: result.lastInsertRowid, message: 'Employee created' });
  } catch (err) {
    if (err.message.includes('UNIQUE')) {
      return res.status(409).json({ error: 'Employee name already exists' });
    }
    res.status(500).json({ error: err.message });
  }
});

// ═══════════════════════════════════════
//  ALBI PROJECT SYNC
// ═══════════════════════════════════════

app.post('/api/albi/sync-projects', requireAdmin, async (req, res) => {
  if (SKIP_ALBI) {
    return res.json({ message: 'Albi sync skipped (SKIP_ALBI=true)', synced: 0 });
  }

  let page = 1;
  let total = 0;

  while (true) {
    const data = await albiRequest('GET', `/Projects?page=${page}&pageSize=100&openOnly=true`);
    if (!data || !data.data || data.data.length === 0) break;

    const projects = Array.isArray(data.data) ? data.data : [data.data];
    for (const p of projects) {
      queries.upsertProject.run({
        project_id: String(p.id || p.projectId),
        project_name: p.projectName || p.name || '',
        address: [p.address1, p.city, p.state].filter(Boolean).join(', '),
        status: p.status || '',
        customer_name: p.customerName || '',
      });
      total++;
    }

    if (projects.length < 100) break;
    page++;
  }

  res.json({ message: `Synced ${total} projects from Albi`, synced: total });
});

app.get('/api/albi/projects', requirePin, (req, res) => {
  res.json(queries.getCachedProjects.all());
});

// ═══════════════════════════════════════
//  QR CODE GENERATION
// ═══════════════════════════════════════

app.get('/api/qr/:sku', async (req, res) => {
  const item = queries.getItemBySku.get(req.params.sku);
  if (!item) return res.status(404).json({ error: 'Item not found' });

  const url = `${BASE_URL}/checkout.html?sku=${encodeURIComponent(item.sku)}`;

  try {
    const format = req.query.format || 'png';
    if (format === 'svg') {
      const svg = await QRCode.toString(url, { type: 'svg', width: 300 });
      res.setHeader('Content-Type', 'image/svg+xml');
      res.send(svg);
    } else {
      const png = await QRCode.toBuffer(url, { width: 300, margin: 2 });
      res.setHeader('Content-Type', 'image/png');
      res.send(png);
    }
  } catch (err) {
    res.status(500).json({ error: 'QR generation failed' });
  }
});

// Generate printable label sheet (HTML)
app.get('/api/qr/labels/print', requireAdmin, async (req, res) => {
  const items = queries.getAllItems.all();
  let html = `<!DOCTYPE html><html><head><title>WaterPro Inventory Labels</title>
  <style>
    @media print { body { margin: 0; } .label { break-inside: avoid; } }
    body { font-family: Arial, sans-serif; }
    .labels { display: flex; flex-wrap: wrap; gap: 10px; padding: 10px; }
    .label {
      border: 1px solid #ccc; border-radius: 8px; padding: 12px;
      width: 250px; text-align: center;
    }
    .label img { width: 150px; height: 150px; }
    .label .name { font-weight: bold; font-size: 16px; margin: 6px 0 2px; }
    .label .sku { color: #666; font-size: 12px; }
    .label .uom { color: #888; font-size: 11px; }
    .label .cost { font-size: 13px; margin-top: 2px; }
  </style></head><body>
  <h2 style="padding:10px;">WaterPro Inventory Labels — Print & Cut</h2>
  <div class="labels">`;

  for (const item of items) {
    const url = `${BASE_URL}/checkout.html?sku=${encodeURIComponent(item.sku)}`;
    const dataUrl = await QRCode.toDataURL(url, { width: 150, margin: 1 });
    html += `<div class="label">
      <img src="${dataUrl}" />
      <div class="name">${item.name}</div>
      <div class="sku">${item.sku}</div>
      <div class="uom">Unit: ${item.unit_of_measure}</div>
      <div class="cost">$${item.unit_cost.toFixed(2)} / ${item.unit_of_measure}</div>
    </div>`;
  }

  html += '</div></body></html>';
  res.setHeader('Content-Type', 'text/html');
  res.send(html);
});

// ═══════════════════════════════════════
//  REPORTS
// ═══════════════════════════════════════

app.get('/api/reports/cost-by-job', requireAdmin, (req, res) => {
  const start = req.query.start || '2020-01-01';
  const end = req.query.end || '2099-12-31';
  res.json(queries.costByJob.all(start, end));
});

app.get('/api/reports/cost-by-category', requireAdmin, (req, res) => {
  const start = req.query.start || '2020-01-01';
  const end = req.query.end || '2099-12-31';
  res.json(queries.costByCategory.all(start, end));
});

app.get('/api/reports/cost-by-employee', requireAdmin, (req, res) => {
  const start = req.query.start || '2020-01-01';
  const end = req.query.end || '2099-12-31';
  res.json(queries.costByEmployee.all(start, end));
});

app.get('/api/reports/top-items', requireAdmin, (req, res) => {
  const start = req.query.start || '2020-01-01';
  const end = req.query.end || '2099-12-31';
  res.json(queries.topItems.all(start, end));
});

// ═══════════════════════════════════════
//  JOB COSTING (Albi labor + local materials)
// ═══════════════════════════════════════

// Full job cost for a single project
app.get('/api/reports/job-cost/:projectId', requireAdmin, async (req, res) => {
  const projectId = req.params.projectId;

  // Local material costs
  const materials = queries.getCheckoutsByJob.all(projectId);
  const materialTotal = materials.reduce((sum, c) => sum + c.total_cost, 0);

  // Albi labor costs (timesheets + expenses)
  let laborTotal = 0;
  let laborEntries = [];
  let equipmentTotal = 0;
  let equipmentEntries = [];
  let albiExpenses = [];
  let projectInfo = null;
  let financialKpi = null;

  if (!SKIP_ALBI && ALBI_API_KEY) {
    // Pull project info
    const projData = await albiRequest('GET', `/Projects/${projectId}`);
    if (projData && projData.data) projectInfo = projData.data;

    // Pull financial KPI
    const kpiData = await albiRequest('GET', `/Projects/GetProjectFinancialKPI?projectId=${projectId}`);
    if (kpiData && kpiData.data) financialKpi = kpiData.data;

    // Pull all expenses from Albi (includes auto-generated labor expenses)
    let page = 1;
    while (true) {
      const expData = await albiRequest('GET', `/Projects/GetProjectExpenses?projectId=${projectId}&page=${page}&pageSize=100`);
      if (!expData || !expData.data || expData.data.length === 0) break;
      const expenses = Array.isArray(expData.data) ? expData.data : [expData.data];
      for (const exp of expenses) {
        if (exp.deleted) continue;
        albiExpenses.push(exp);
        if (exp.subcategory === 'Labour') {
          laborTotal += exp.total || 0;
          laborEntries.push({ payee: exp.payee, memo: exp.memo, total: exp.total, date: exp.expenseDate });
        } else if (exp.subcategory === 'Equipment') {
          equipmentTotal += exp.total || 0;
          equipmentEntries.push({ memo: exp.memo, total: exp.total, date: exp.expenseDate });
        }
      }
      if (expenses.length < 100) break;
      page++;
    }

    // Also pull equipment assigned to project
    const eqData = await albiRequest('GET', `/Projects/GetProjectEquipment?projectId=${projectId}`);
    if (eqData && eqData.data && Array.isArray(eqData.data)) {
      equipmentEntries = equipmentEntries.concat(
        eqData.data.map(e => ({ name: e.equipmentCustomId || e.equipmentTypeName, memo: e.equipmentTypeName, placed: e.placedDate, removed: e.removedDate }))
      );
    }
  }

  const totalJobCost = laborTotal + materialTotal + equipmentTotal;

  res.json({
    projectId,
    projectName: projectInfo?.projectName || projectInfo?.name || '',
    customerName: projectInfo?.customerName || '',
    summary: {
      laborCost: laborTotal,
      materialCost: materialTotal,
      equipmentCost: equipmentTotal,
      totalJobCost,
    },
    labor: laborEntries,
    materials: materials.map(m => ({
      item: m.item_name,
      sku: m.sku,
      qty: m.quantity,
      unitCost: m.unit_cost_at_time,
      total: m.total_cost,
      employee: m.employee_name,
      date: m.checkout_date,
    })),
    equipment: equipmentEntries,
    financialKpi,
  });
});

// Summary across all jobs with material checkouts
app.get('/api/reports/job-cost-summary', requireAdmin, async (req, res) => {
  const start = req.query.start || '2020-01-01';
  const end = req.query.end || '2099-12-31';

  // Get all jobs with material costs
  const jobMaterials = queries.costByJob.all(start, end);

  // For each job, try to pull Albi labor costs
  const results = [];
  for (const job of jobMaterials) {
    let laborTotal = 0;
    let equipmentTotal = 0;

    if (!SKIP_ALBI && ALBI_API_KEY) {
      const expData = await albiRequest('GET', `/Projects/GetProjectExpenses?projectId=${job.job_number}&page=1&pageSize=100`);
      if (expData && expData.data && Array.isArray(expData.data)) {
        for (const exp of expData.data) {
          if (exp.deleted) continue;
          if (exp.subcategory === 'Labour') laborTotal += exp.total || 0;
          else if (exp.subcategory === 'Equipment') equipmentTotal += exp.total || 0;
        }
      }
    }

    results.push({
      jobNumber: job.job_number,
      jobName: job.job_name,
      materialCost: job.total_materials_cost,
      laborCost: laborTotal,
      equipmentCost: equipmentTotal,
      totalCost: job.total_materials_cost + laborTotal + equipmentTotal,
      checkoutCount: job.checkout_count,
    });
  }

  // Sort by total cost descending
  results.sort((a, b) => b.totalCost - a.totalCost);
  res.json(results);
});

// ═══════════════════════════════════════
//  SERVE FRONTEND
// ═══════════════════════════════════════

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'checkout.html')));
app.get('/admin', (req, res) => res.sendFile(path.join(__dirname, 'public', 'admin.html')));

app.listen(PORT, () => {
  const items = queries.getAllItems.all();
  console.log(`WaterPro Inventory running on port ${PORT}`);
  console.log(`Items in database: ${items.length}`);
  console.log(`Albi integration: ${SKIP_ALBI ? 'SKIPPED' : (ALBI_API_KEY ? 'CONNECTED' : 'NO KEY')}`);
  console.log(`Checkout URL: ${BASE_URL}/checkout.html`);
  console.log(`Admin URL: ${BASE_URL}/admin`);
});
