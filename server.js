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

// Conectar a SQLite (la base de datos se crea en /data/inventario.db)
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
      sku TEXT PRIMARY KEY,
      cantidad INTEGER DEFAULT 0,
      FOREIGN KEY (sku) REFERENCES productos(sku) ON DELETE CASCADE
    )
  `);

  // Migración inicial: si la tabla productos está vacía y existe productos_data.json, cargarlo
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
//  API ENDPOINTS
// ================================================================

// GET /api/productos → devuelve todos los productos con stock
app.get('/api/productos', (req, res) => {
  const query = `
    SELECT p.sku, p.nombre, p.categoria, p.imagenUrl, IFNULL(s.cantidad, 0) as stock
    FROM productos p
    LEFT JOIN stocks s ON p.sku = s.sku
  `;
  db.all(query, (err, rows) => {
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
      if (p.stock !== undefined) {
        db.run(
          `INSERT OR REPLACE INTO stocks (sku, cantidad) VALUES (?, ?)`,
          [p.sku, p.stock],
          (err) => { if (err) { console.error(err); error = true; } }
        );
      }
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

// POST /api/productos/:sku/stock → actualizar stock individual
app.post('/api/productos/:sku/stock', (req, res) => {
  const { sku } = req.params;
  const { cantidad } = req.body;
  if (typeof cantidad !== 'number') {
    return res.status(400).json({ error: 'La cantidad debe ser un número' });
  }
  db.run(
    `INSERT OR REPLACE INTO stocks (sku, cantidad) VALUES (?, ?)`,
    [sku, cantidad],
    (err) => {
      if (err) {
        console.error(err);
        return res.status(500).json({ error: 'Error al actualizar stock' });
      }
      res.json({ success: true });
    }
  );
});

// DELETE /api/productos/:sku → eliminar producto
app.delete('/api/productos/:sku', (req, res) => {
  const { sku } = req.params;
  db.run('DELETE FROM productos WHERE sku = ?', [sku], (err) => {
    if (err) {
      console.error(err);
      return res.status(500).json({ error: 'Error al eliminar producto' });
    }
    res.json({ success: true });
  });
});

// ================================================================
//  SERVIR FRONTEND ESTÁTICO
// ================================================================
app.use(express.static(path.join(__dirname, 'public')));

// Para cualquier ruta no API, devolver index.html (SPA)
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Iniciar servidor
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Servidor corriendo en http://0.0.0.0:${PORT}`);
});
