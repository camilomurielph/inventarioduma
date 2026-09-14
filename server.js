const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const sqlite3 = require('sqlite3').verbose();
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(bodyParser.json({ limit: '10mb' }));

// Conectar a SQLite
const DB_PATH = process.env.DB_PATH || './data/inventario.db';
const dbDir = path.dirname(DB_PATH);
if (!fs.existsSync(dbDir)) fs.mkdirSync(dbDir, { recursive: true });
const db = new sqlite3.Database(DB_PATH);

// Crear tablas si no existen
db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS productos (
      sku TEXT PRIMARY KEY,
      nombre TEXT NOT NULL,
      categoria TEXT NOT NULL,
      imagenUrl TEXT
    )
  `);
  db.run(`
    CREATE TABLE IF NOT EXISTS stocks (
      sku TEXT NOT NULL,
      usuario TEXT NOT NULL,
      cantidad INTEGER DEFAULT 0,
      PRIMARY KEY (sku, usuario),
      FOREIGN KEY (sku) REFERENCES productos(sku) ON DELETE CASCADE
    )
  `);

  // Migración inicial desde productos_data.json
  db.get('SELECT COUNT(*) as count FROM productos', (err, row) => {
    if (err) return console.error(err);
    if (row.count === 0) {
      const jsonPath = path.join(__dirname, 'productos_data.json');
      if (fs.existsSync(jsonPath)) {
        try {
          const data = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));
          console.log(`Migrando ${data.length} productos desde productos_data.json...`);
          db.serialize(() => {
            db.run('BEGIN TRANSACTION');
            for (const p of data) {
              db.run(
                'INSERT OR IGNORE INTO productos (sku, nombre, categoria, imagenUrl) VALUES (?, ?, ?, ?)',
                [p.sku, p.nombre, p.categoria, p.imagenUrl || '']
              );
            }
            db.run('COMMIT', (err) => {
              if (err) console.error('Error en migración:', err);
              else console.log('Migración completada');
            });
          });
        } catch (e) {
          console.error('Error al leer productos_data.json:', e);
        }
      }
    }
  });
});

// ================================================================
//  API PRODUCTOS
// ================================================================

// GET /api/productos → devuelve todos los productos (sin stock)
app.get('/api/productos', (req, res) => {
  db.all('SELECT sku, nombre, categoria, imagenUrl FROM productos', (err, rows) => {
    if (err) {
      console.error(err);
      return res.status(500).json({ error: 'Error al obtener productos' });
    }
    res.json(rows);
  });
});

// POST /api/productos → guardar/actualizar múltiples productos
app.post('/api/productos', (req, res) => {
  const productos = req.body;
  if (!Array.isArray(productos)) {
    return res.status(400).json({ error: 'Se espera un array de productos' });
  }

  db.serialize(() => {
    db.run('BEGIN TRANSACTION');
    let error = false;
    for (const p of productos) {
      db.run(
        `INSERT OR REPLACE INTO productos (sku, nombre, categoria, imagenUrl)
         VALUES (?, ?, ?, ?)`,
        [p.sku, p.nombre, p.categoria, p.imagenUrl || ''],
        (err) => { if (err) { console.error(err); error = true; } }
      );
    }
    if (error) {
      db.run('ROLLBACK');
      return res.status(500).json({ error: 'Error al guardar productos' });
    } else {
      db.run('COMMIT');
      res.json({ success: true });
    }
  });
});

// DELETE /api/productos/:sku → eliminar producto y sus stocks
app.delete('/api/productos/:sku', (req, res) => {
  const { sku } = req.params;
  db.serialize(() => {
    db.run('DELETE FROM stocks WHERE sku = ?', [sku]);
    db.run('DELETE FROM productos WHERE sku = ?', [sku], (err) => {
      if (err) {
        console.error(err);
        return res.status(500).json({ error: 'Error al eliminar producto' });
      }
      res.json({ success: true });
    });
  });
});

// ================================================================
//  API STOCKS POR USUARIO
// ================================================================

// GET /api/stocks/:usuario → devuelve { sku: cantidad }
app.get('/api/stocks/:usuario', (req, res) => {
  const { usuario } = req.params;
  db.all(
    'SELECT sku, cantidad FROM stocks WHERE usuario = ?',
    [usuario],
    (err, rows) => {
      if (err) {
        console.error(err);
        return res.status(500).json({ error: 'Error al obtener stocks' });
      }
      const stock = {};
      rows.forEach(r => { stock[r.sku] = r.cantidad; });
      res.json(stock);
    }
  );
});

// POST /api/stocks/:usuario → guarda/actualiza stocks (payload: { sku: cantidad })
app.post('/api/stocks/:usuario', (req, res) => {
  const { usuario } = req.params;
  const stock = req.body;
  if (typeof stock !== 'object' || Array.isArray(stock)) {
    return res.status(400).json({ error: 'Se espera un objeto { sku: cantidad }' });
  }

  db.serialize(() => {
    db.run('BEGIN TRANSACTION');
    let error = false;
    for (const [sku, cantidad] of Object.entries(stock)) {
      db.run(
        `INSERT OR REPLACE INTO stocks (sku, usuario, cantidad) VALUES (?, ?, ?)`,
        [sku, usuario, cantidad],
        (err) => { if (err) { console.error(err); error = true; } }
      );
    }
    if (error) {
      db.run('ROLLBACK');
      return res.status(500).json({ error: 'Error al guardar stocks' });
    } else {
      db.run('COMMIT');
      res.json({ success: true });
    }
  });
});

// DELETE /api/stocks/:usuario → resetea todos los stocks del usuario
app.delete('/api/stocks/:usuario', (req, res) => {
  const { usuario } = req.params;
  db.run('DELETE FROM stocks WHERE usuario = ?', [usuario], (err) => {
    if (err) {
      console.error(err);
      return res.status(500).json({ error: 'Error al resetear stocks' });
    }
    res.json({ success: true });
  });
});

// ================================================================
//  SERVIR FRONTEND ESTÁTICO
// ================================================================
app.use(express.static(path.join(__dirname, 'public')));

// Para cualquier ruta no API, devolver index.html
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Servidor corriendo en http://0.0.0.0:${PORT}`);
});
