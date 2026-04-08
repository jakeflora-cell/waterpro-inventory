/**
 * WaterPro Inventory — Seed Script
 * Run: node seed.js
 * Seeds the database with initial employees and common restoration/cleaning materials.
 */

const { db, queries } = require('./db');

console.log('Seeding WaterPro Inventory database...\n');

// ─── Employees (from Albi salesperson list, April 2026) ───
const employees = [
  { name: 'Jake Flora', pin: '8347', role: 'admin' },
  { name: 'Madison Ingram', pin: '5912', role: 'supervisor' },
  { name: 'Audrey Melton', pin: '3748', role: 'supervisor' },
  { name: 'A.J. Hodges', pin: '6201', role: 'tech' },
  { name: 'AJ Epeards', pin: '4583', role: 'tech' },
  { name: 'Andrew Siglin', pin: '7629', role: 'tech' },
  { name: 'Ayrton Swaby', pin: '1956', role: 'tech' },
  { name: 'Ian Beck', pin: '8074', role: 'tech' },
  { name: 'Jonas Burnette', pin: '3415', role: 'tech' },
  { name: 'Ollie Cano', pin: '9263', role: 'tech' },
  { name: 'Tralinda Nelson', pin: '5037', role: 'tech' },
  { name: 'Devin Smith', pin: '4718', role: 'tech' },
  { name: 'Desmond Mcglaun', pin: '6392', role: 'tech' },
  { name: 'Joshua Lovelace', pin: '7841', role: 'tech' },
];

const insertEmp = db.prepare(`
  INSERT OR IGNORE INTO employees (name, pin, role) VALUES (@name, @pin, @role)
`);

const seedEmployees = db.transaction(() => {
  for (const emp of employees) {
    insertEmp.run(emp);
  }
});

seedEmployees();
console.log(`Employees seeded: ${employees.length}`);

// ─── Inventory Items ───
const items = [
  // ── Plastic / Containment ──
  { sku: 'PLY-SHEET-4X8', name: 'Plastic Sheeting 4x8', category: 'consumable', unit_cost: 12.50, unit_of_measure: 'sheet', current_quantity: 50, reorder_threshold: 10, location: 'Shelf A-1' },
  { sku: 'PLY-ROLL-6MIL', name: 'Poly Sheeting 6mil Roll (20x100)', category: 'consumable', unit_cost: 45.00, unit_of_measure: 'roll', current_quantity: 8, reorder_threshold: 3, location: 'Shelf A-1' },
  { sku: 'TAPE-BLUE', name: 'Blue Painters Tape', category: 'consumable', unit_cost: 5.50, unit_of_measure: 'roll', current_quantity: 30, reorder_threshold: 10, location: 'Shelf A-2' },
  { sku: 'TAPE-DUCT', name: 'Duct Tape', category: 'consumable', unit_cost: 8.00, unit_of_measure: 'roll', current_quantity: 20, reorder_threshold: 8, location: 'Shelf A-2' },
  { sku: 'TAPE-SHEATHING', name: 'Sheathing Tape (Tyvek)', category: 'consumable', unit_cost: 12.00, unit_of_measure: 'roll', current_quantity: 10, reorder_threshold: 4, location: 'Shelf A-2' },
  { sku: 'ZIPPER-DOOR', name: 'Zipper Door (Self-Adhesive)', category: 'consumable', unit_cost: 8.50, unit_of_measure: 'each', current_quantity: 15, reorder_threshold: 5, location: 'Shelf A-3' },

  // ── Cleaning Chemicals ──
  { sku: 'CHEM-ANTIMICRO', name: 'Antimicrobial Solution (1gal)', category: 'consumable', unit_cost: 28.00, unit_of_measure: 'gallon', current_quantity: 12, reorder_threshold: 4, location: 'Shelf B-1' },
  { sku: 'CHEM-DEODOR', name: 'Deodorizer Concentrate (1gal)', category: 'consumable', unit_cost: 22.00, unit_of_measure: 'gallon', current_quantity: 8, reorder_threshold: 3, location: 'Shelf B-1' },
  { sku: 'CHEM-ENCAP', name: 'Encapsulant (5gal)', category: 'consumable', unit_cost: 95.00, unit_of_measure: 'each', current_quantity: 4, reorder_threshold: 2, location: 'Shelf B-2' },
  { sku: 'CHEM-CARPET-PRE', name: 'Carpet Pre-Spray (1gal)', category: 'consumable', unit_cost: 18.00, unit_of_measure: 'gallon', current_quantity: 10, reorder_threshold: 4, location: 'Shelf B-1' },
  { sku: 'CHEM-SPOTTER', name: 'Stain Spotter (32oz)', category: 'consumable', unit_cost: 12.00, unit_of_measure: 'each', current_quantity: 15, reorder_threshold: 5, location: 'Shelf B-3' },

  // ── Drywall / Reconstruction ──
  { sku: 'DRYWALL-4X8', name: 'Drywall Sheet 1/2" 4x8', category: 'consumable', unit_cost: 14.00, unit_of_measure: 'sheet', current_quantity: 20, reorder_threshold: 8, location: 'Bay C' },
  { sku: 'DRYWALL-MUD', name: 'Joint Compound (5gal)', category: 'consumable', unit_cost: 18.00, unit_of_measure: 'each', current_quantity: 6, reorder_threshold: 2, location: 'Shelf C-1' },
  { sku: 'DRYWALL-TAPE', name: 'Drywall Tape (500ft)', category: 'consumable', unit_cost: 8.00, unit_of_measure: 'roll', current_quantity: 10, reorder_threshold: 3, location: 'Shelf C-1' },
  { sku: 'SCREWS-DW-1-5/8', name: 'Drywall Screws 1-5/8" (1lb)', category: 'consumable', unit_cost: 8.50, unit_of_measure: 'bag', current_quantity: 12, reorder_threshold: 4, location: 'Shelf C-2' },

  // ── Safety / PPE ──
  { sku: 'PPE-RESP-N95', name: 'N95 Respirator', category: 'consumable', unit_cost: 3.50, unit_of_measure: 'each', current_quantity: 100, reorder_threshold: 30, location: 'Shelf D-1' },
  { sku: 'PPE-RESP-HALFMASK', name: 'Half-Face Respirator P100', category: 'consumable', unit_cost: 32.00, unit_of_measure: 'each', current_quantity: 8, reorder_threshold: 3, location: 'Shelf D-1' },
  { sku: 'PPE-GLOVES-NITRILE', name: 'Nitrile Gloves Box (100ct)', category: 'consumable', unit_cost: 14.00, unit_of_measure: 'box', current_quantity: 20, reorder_threshold: 6, location: 'Shelf D-2' },
  { sku: 'PPE-TYVEK-SUIT', name: 'Tyvek Suit', category: 'consumable', unit_cost: 8.00, unit_of_measure: 'each', current_quantity: 25, reorder_threshold: 10, location: 'Shelf D-2' },
  { sku: 'PPE-BOOTIES', name: 'Shoe Covers (pair)', category: 'consumable', unit_cost: 0.75, unit_of_measure: 'pair', current_quantity: 200, reorder_threshold: 50, location: 'Shelf D-3' },
  { sku: 'PPE-GOGGLES', name: 'Safety Goggles', category: 'consumable', unit_cost: 6.00, unit_of_measure: 'each', current_quantity: 12, reorder_threshold: 5, location: 'Shelf D-1' },

  // ── Fasteners / Hardware ──
  { sku: 'STAPLES-T50', name: 'Staples T50 (1000ct)', category: 'consumable', unit_cost: 6.00, unit_of_measure: 'box', current_quantity: 10, reorder_threshold: 3, location: 'Shelf E-1' },
  { sku: 'ZIPTIES-12', name: 'Zip Ties 12" (100ct)', category: 'consumable', unit_cost: 5.00, unit_of_measure: 'bag', current_quantity: 8, reorder_threshold: 3, location: 'Shelf E-1' },

  // ── Misc Consumables ──
  { sku: 'FILTER-HEPA', name: 'HEPA Filter Replacement', category: 'consumable', unit_cost: 45.00, unit_of_measure: 'each', current_quantity: 6, reorder_threshold: 2, location: 'Shelf F-1' },
  { sku: 'BAG-TRASH-42GAL', name: 'Contractor Trash Bags 42gal (50ct)', category: 'consumable', unit_cost: 22.00, unit_of_measure: 'box', current_quantity: 8, reorder_threshold: 3, location: 'Shelf F-2' },
  { sku: 'HOSE-LAYFLAT-2X50', name: 'Lay-Flat Hose 2"x50ft', category: 'consumable', unit_cost: 35.00, unit_of_measure: 'each', current_quantity: 4, reorder_threshold: 2, location: 'Bay G' },

  // ── Tools (checked out and returned) ──
  { sku: 'TOOL-MOISTURE-METER', name: 'Moisture Meter (Delmhorst)', category: 'tool', unit_cost: 0, unit_of_measure: 'each', current_quantity: 4, reorder_threshold: 0, location: 'Tool Cage' },
  { sku: 'TOOL-THERMO-HYGRO', name: 'Thermo-Hygrometer', category: 'tool', unit_cost: 0, unit_of_measure: 'each', current_quantity: 4, reorder_threshold: 0, location: 'Tool Cage' },
  { sku: 'TOOL-THERMAL-CAM', name: 'Thermal Imaging Camera', category: 'tool', unit_cost: 0, unit_of_measure: 'each', current_quantity: 2, reorder_threshold: 0, location: 'Tool Cage' },
  { sku: 'TOOL-STAPLE-GUN', name: 'Staple Gun (Arrow T50)', category: 'tool', unit_cost: 0, unit_of_measure: 'each', current_quantity: 3, reorder_threshold: 0, location: 'Tool Cage' },
  { sku: 'TOOL-DRILL', name: 'Cordless Drill', category: 'tool', unit_cost: 0, unit_of_measure: 'each', current_quantity: 4, reorder_threshold: 0, location: 'Tool Cage' },
  { sku: 'TOOL-SAWZALL', name: 'Reciprocating Saw', category: 'tool', unit_cost: 0, unit_of_measure: 'each', current_quantity: 2, reorder_threshold: 0, location: 'Tool Cage' },
  { sku: 'TOOL-SHOP-VAC', name: 'Shop Vac 14gal', category: 'tool', unit_cost: 0, unit_of_measure: 'each', current_quantity: 3, reorder_threshold: 0, location: 'Bay G' },
];

const insertItem = db.prepare(`
  INSERT OR IGNORE INTO items (sku, name, category, unit_cost, unit_of_measure, current_quantity, reorder_threshold, location, notes)
  VALUES (@sku, @name, @category, @unit_cost, @unit_of_measure, @current_quantity, @reorder_threshold, @location, '')
`);

const seedItems = db.transaction(() => {
  for (const item of items) {
    insertItem.run(item);
  }
});

seedItems();
console.log(`Items seeded: ${items.length}`);

console.log('\nDone! Start the server with: npm start');
console.log(`\nDefault PINs:`);
employees.forEach(e => console.log(`  ${e.name}: ${e.pin} (${e.role})`));
