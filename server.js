// server.js
require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const multer = require('multer');

const app = express();

// Middlewares
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Config
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'cambiame_por_una_clave_segura';
const DB_PATH = path.join(__dirname, 'gym.db');

// Static
app.use(express.static(path.join(__dirname, 'public')));

// DB
const db = new sqlite3.Database(DB_PATH, (err) => {
  if (err) console.error('Error abriendo la base de datos:', err.message);
  else console.log('Base de datos abierta correctamente.');
});

// Helpers async
function runAsync(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) reject(err);
      else resolve(this);
    });
  });
}

function getAsync(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
}

function allAsync(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
}

// Avatar folder + multer
const uploadDir = path.join(__dirname, 'public', 'avatars');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const unique = Date.now() + '-' + Math.round(Math.random() * 1e9);
    const ext = path.extname(file.originalname);
    cb(null, unique + ext);
  }
});
const upload = multer({ storage });

// ---------- CREATE TABLES ----------
db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS admins (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE,
    password_hash TEXT
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS members (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    cedula TEXT UNIQUE,
    nombre TEXT,
    email TEXT,
    telefono TEXT,
    password_hash TEXT,
    plan TEXT CHECK(plan IN ('dia','semana','mes')),
    fecha_inicio TEXT,
    fecha_vencimiento TEXT,
    activo INTEGER DEFAULT 1,
    avatar TEXT,
    fav_machines TEXT,
    goals TEXT
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS workouts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    titulo TEXT,
    descripcion TEXT
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS member_workouts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    member_id INTEGER,
    workout_id INTEGER,
    fecha TEXT,
    FOREIGN KEY(member_id) REFERENCES members(id),
    FOREIGN KEY(workout_id) REFERENCES workouts(id)
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS payments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    member_id INTEGER,
    amount REAL,
    fecha TEXT,
    created_by INTEGER
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS member_routine_templates (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    member_id INTEGER,
    day_of_week INTEGER,
    titulo TEXT,
    descripcion TEXT,
    UNIQUE(member_id, day_of_week),
    FOREIGN KEY(member_id) REFERENCES members(id)
  )`);

  // Alter por si ya existía la tabla
  db.run(`ALTER TABLE members ADD COLUMN cedula TEXT`, () => {});
  db.run(`ALTER TABLE members ADD COLUMN avatar TEXT`, () => {});
  db.run(`ALTER TABLE members ADD COLUMN fav_machines TEXT`, () => {});
  db.run(`ALTER TABLE members ADD COLUMN goals TEXT`, () => {});
});

// Default admin
(async () => {
  try {
    const existing = await getAsync(
      'SELECT * FROM admins WHERE username = ?',
      ['admin']
    );
    if (!existing) {
      const hash = await bcrypt.hash('admin123', 10);
      await runAsync(
        'INSERT INTO admins (username, password_hash) VALUES (?, ?)',
        ['admin', hash]
      );
      console.log('Admin por defecto: admin / admin123');
    }
  } catch (err) {
    console.error(err);
  }
})();

// ---------- AUTH HELPERS ----------
function signToken(payload) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '7d' });
}

function authMiddleware(role) {
  return (req, res, next) => {
    const auth = req.headers.authorization;
    if (!auth) return res.status(401).json({ error: 'No autorizado' });
    const token = auth.split(' ')[1];
    try {
      const payload = jwt.verify(token, JWT_SECRET);
      if (role && payload.role !== role) {
        return res.status(403).json({ error: 'Sin permiso' });
      }
      req.user = payload;
      next();
    } catch (e) {
      return res.status(401).json({ error: 'Token inválido' });
    }
  };
}

// ---------- LOGIN ----------
app.post('/api/login', async (req, res) => {
  const { emailOrUsername, password } = req.body;

  try {
    // Admin
    let user = await getAsync(
      'SELECT * FROM admins WHERE username = ?',
      [emailOrUsername]
    );
    if (user) {
      const ok = await bcrypt.compare(password, user.password_hash);
      if (!ok) return res.status(401).json({ error: 'Credenciales inválidas' });
      const token = signToken({ id: user.id, role: 'admin' });
      return res.json({ token, role: 'admin' });
    }

    // Member por cédula
    user = await getAsync(
      'SELECT * FROM members WHERE cedula = ? AND activo = 1',
      [emailOrUsername]
    );
    if (!user)
      return res.status(401).json({ error: 'Credenciales inválidas' });

    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) return res.status(401).json({ error: 'Credenciales inválidas' });

    const token = signToken({ id: user.id, role: 'member' });
    return res.json({ token, role: 'member' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error en el servidor' });
  }
});

// ---------- ADMIN: CREAR MIEMBRO ----------
app.post(
  '/api/admin/members',
  authMiddleware('admin'),
  upload.single('avatar'),
  async (req, res) => {
    const { cedula, nombre, email, telefono, plan, password } = req.body;
    const validPlans = ['dia', 'semana', 'mes'];

    if (!cedula || !nombre || !password || !plan) {
      return res
        .status(400)
        .json({ error: 'Cédula, nombre, password y plan son obligatorios' });
    }
    if (!validPlans.includes(plan)) {
      return res.status(400).json({ error: 'Plan inválido' });
    }

    try {
      const existing = await getAsync(
        'SELECT id FROM members WHERE cedula = ? AND activo = 1',
        [cedula]
      );
      if (existing) {
        return res
          .status(400)
          .json({ error: 'Ya existe un miembro con esa cédula' });
      }

      const hash = await bcrypt.hash(password, 10);
      const fecha_inicio = new Date().toISOString().substring(0, 10);
      const days = plan === 'dia' ? 1 : plan === 'semana' ? 7 : 30;
      const fecha_vencimiento = new Date();
      fecha_vencimiento.setDate(fecha_vencimiento.getDate() + days);

      const avatarPath = req.file ? `/avatars/${req.file.filename}` : null;

      const info = await runAsync(
        `INSERT INTO members
          (cedula, nombre, email, telefono, password_hash, plan, fecha_inicio, fecha_vencimiento, activo, avatar)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?)`,
        [
          cedula,
          nombre,
          email || '',
          telefono || '',
          hash,
          plan,
          fecha_inicio,
          fecha_vencimiento.toISOString().substring(0, 10),
          avatarPath
        ]
      );

      res.json({
        id: info.lastID,
        cedula,
        nombre,
        email,
        telefono,
        plan,
        fecha_inicio,
        fecha_vencimiento: fecha_vencimiento.toISOString().substring(0, 10),
        avatar: avatarPath
      });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Error al crear miembro' });
    }
  }
);

// ---------- ADMIN: LISTA MIEMBROS ----------
app.get(
  '/api/admin/members',
  authMiddleware('admin'),
  async (req, res) => {
    try {
      const rows = await allAsync(
        `SELECT id, cedula, nombre, email, telefono, plan,
                fecha_inicio, fecha_vencimiento, activo, avatar
         FROM members
         WHERE activo = 1
         ORDER BY id DESC`
      );
      res.json(rows);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Error al obtener miembros' });
    }
  }
);

// ---------- ADMIN: VER MIEMBRO ----------
app.get(
  '/api/admin/members/:id',
  authMiddleware('admin'),
  async (req, res) => {
    try {
      const member = await getAsync(
        `SELECT id, cedula, nombre, email, telefono, plan,
                fecha_inicio, fecha_vencimiento, activo, avatar
         FROM members WHERE id = ?`,
        [req.params.id]
      );
      if (!member) {
        return res.status(404).json({ error: 'Miembro no encontrado' });
      }
      res.json(member);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Error al obtener miembro' });
    }
  }
);

// ---------- ADMIN: ELIMINAR (LÓGICO) ----------
app.delete(
  '/api/admin/members/:id',
  authMiddleware('admin'),
  async (req, res) => {
    try {
      const id = req.params.id;
      const member = await getAsync(
        'SELECT id FROM members WHERE id = ? AND activo = 1',
        [id]
      );
      if (!member) {
        return res
          .status(404)
          .json({ error: 'Miembro no encontrado o ya eliminado' });
      }

      await runAsync(
        'UPDATE members SET activo = 0 WHERE id = ?',
        [id]
      );
      res.json({ ok: true });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Error al eliminar miembro' });
    }
  }
);

// ---------- ADMIN: RENOVAR ----------
app.post(
  '/api/admin/payments',
  authMiddleware('admin'),
  async (req, res) => {
    try {
      const { member_id, amount = 0, extend_days } = req.body;

      if (!member_id || !extend_days) {
        return res
          .status(400)
          .json({ error: 'member_id y extend_days son requeridos' });
      }

      const member = await getAsync(
        'SELECT fecha_vencimiento FROM members WHERE id = ?',
        [member_id]
      );
      if (!member) {
        return res.status(404).json({ error: 'Miembro no encontrado' });
      }

      const hoy = new Date();
      hoy.setHours(0, 0, 0, 0);

      let base = member.fecha_vencimiento
        ? new Date(member.fecha_vencimiento)
        : hoy;

      if (base < hoy) base = hoy;
      base.setHours(0, 0, 0, 0);

      const nuevoVenc = new Date(base);
      nuevoVenc.setDate(nuevoVenc.getDate() + Number(extend_days));
      const nuevoVencStr = nuevoVenc.toISOString().substring(0, 10);

      await runAsync(
        'UPDATE members SET fecha_vencimiento = ? WHERE id = ?',
        [nuevoVencStr, member_id]
      );

      await runAsync(
        'INSERT INTO payments (member_id, amount, fecha, created_by) VALUES (?, ?, ?, ?)',
        [member_id, amount, new Date().toISOString(), req.user.id]
      );

      res.json({ new_venc: nuevoVencStr });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Error al renovar membresía' });
    }
  }
);

// ---------- MEMBER: DATOS PROPIOS ----------
app.get(
  '/api/member/me',
  authMiddleware('member'),
  async (req, res) => {
    try {
      const member = await getAsync(
        'SELECT * FROM members WHERE id = ? AND activo = 1',
        [req.user.id]
      );
      if (!member) {
        return res.status(404).json({ error: 'Miembro no encontrado' });
      }

      const today = new Date();
      const venc = member.fecha_vencimiento
        ? new Date(member.fecha_vencimiento)
        : null;
      const dias_restantes = venc
        ? Math.ceil((venc - today) / (1000 * 60 * 60 * 24))
        : null;

      res.json({
        id: member.id,
        cedula: member.cedula,
        nombre: member.nombre,
        email: member.email,
        telefono: member.telefono,
        plan: member.plan,
        fecha_inicio: member.fecha_inicio,
        fecha_vencimiento: member.fecha_vencimiento,
        dias_restantes,
        avatar: member.avatar,
        fav_machines: member.fav_machines || '',
        goals: member.goals || ''
      });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Error al obtener datos' });
    }
  }
);

// ---------- MEMBER: ACTUALIZAR PERFIL (FOTO + PREFERENCIAS) ----------
app.post(
  '/api/member/profile',
  authMiddleware('member'),
  upload.single('avatar'),
  async (req, res) => {
    try {
      const member = await getAsync(
        'SELECT * FROM members WHERE id = ? AND activo = 1',
        [req.user.id]
      );
      if (!member) {
        return res.status(404).json({ error: 'Miembro no encontrado' });
      }

      const { fav_machines, goals } = req.body;

      const newAvatar = req.file
        ? `/avatars/${req.file.filename}`
        : member.avatar;

      await runAsync(
        `UPDATE members
         SET fav_machines = ?, goals = ?, avatar = ?
         WHERE id = ?`,
        [
          fav_machines !== undefined ? fav_machines : member.fav_machines,
          goals !== undefined ? goals : member.goals,
          newAvatar,
          req.user.id
        ]
      );

      const updated = await getAsync(
        'SELECT * FROM members WHERE id = ?',
        [req.user.id]
      );

      const today = new Date();
      const venc = updated.fecha_vencimiento
        ? new Date(updated.fecha_vencimiento)
        : null;
      const dias_restantes = venc
        ? Math.ceil((venc - today) / (1000 * 60 * 60 * 24))
        : null;

      res.json({
        id: updated.id,
        nombre: updated.nombre,
        avatar: updated.avatar,
        fav_machines: updated.fav_machines || '',
        goals: updated.goals || '',
        dias_restantes,
        fecha_vencimiento: updated.fecha_vencimiento
      });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Error al actualizar perfil' });
    }
  }
);

// ---------- MEMBER: PLANTILLAS RUTINA ----------
app.get(
  '/api/member/routines-template',
  authMiddleware('member'),
  async (req, res) => {
    try {
      const rows = await allAsync(
        'SELECT day_of_week, titulo, descripcion FROM member_routine_templates WHERE member_id = ?',
        [req.user.id]
      );
      res.json({ templates: rows });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Error al obtener plantillas' });
    }
  }
);

app.post(
  '/api/member/routines-template',
  authMiddleware('member'),
  async (req, res) => {
    try {
      const { day_of_week, titulo, descripcion } = req.body;

      if (day_of_week === undefined || day_of_week < 0 || day_of_week > 6) {
        return res.status(400).json({ error: 'day_of_week inválido' });
      }

      if (!titulo && !descripcion) {
        await runAsync(
          'DELETE FROM member_routine_templates WHERE member_id = ? AND day_of_week = ?',
          [req.user.id, day_of_week]
        );
        return res.json({ ok: true, deleted: true });
      }

      const existing = await getAsync(
        'SELECT id FROM member_routine_templates WHERE member_id = ? AND day_of_week = ?',
        [req.user.id, day_of_week]
      );

      if (existing) {
        await runAsync(
          'UPDATE member_routine_templates SET titulo = ?, descripcion = ? WHERE id = ?',
          [titulo, descripcion, existing.id]
        );
      } else {
        await runAsync(
          'INSERT INTO member_routine_templates (member_id, day_of_week, titulo, descripcion) VALUES (?, ?, ?, ?)',
          [req.user.id, day_of_week, titulo, descripcion]
        );
      }

      res.json({ ok: true });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Error al guardar plantilla' });
    }
  }
);

// ---------- MEMBER: RUTINAS SEMANA ----------
app.get(
  '/api/member/workouts/week',
  authMiddleware('member'),
  async (req, res) => {
    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const templates = await allAsync(
        'SELECT day_of_week, titulo, descripcion FROM member_routine_templates WHERE member_id = ?',
        [req.user.id]
      );

      const map = {};
      templates.forEach(t => {
        map[t.day_of_week] = { titulo: t.titulo, descripcion: t.descripcion };
      });

      const workouts = [];
      for (let i = 0; i < 7; i++) {
        const d = new Date(today);
        d.setDate(today.getDate() + i);
        const jsDow = d.getDay();
        if (map[jsDow]) {
          workouts.push({
            fecha: d.toISOString().substring(0, 10),
            titulo: map[jsDow].titulo,
            descripcion: map[jsDow].descripcion
          });
        }
      }

      res.json({ workouts });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Error al obtener rutinas de la semana' });
    }
  }
);

// ---------- SPA FALLBACK ----------
app.get('*', (req, res) => {
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({ error: 'API not found' });
  }
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Start
app.listen(PORT, () => {
  console.log(`Servidor iniciado en http://localhost:${PORT}`);
});
