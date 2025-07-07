const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const XLSX = require('xlsx');
const excelJS = require('exceljs');

const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const dataDir = __dirname;
const publicDir = path.join(__dirname, 'public');
app.use(express.static(publicDir));

function leerJSON(file) {
  try {
    return JSON.parse(fs.readFileSync(path.join(dataDir, file), 'utf8'));
  } catch {
    return [];
  }
}

function guardarJSON(file, data) {
  try {
    fs.writeFileSync(path.join(dataDir, file), JSON.stringify(data, null, 2), 'utf8');
  } catch (e) {
    console.error(`Error guardando ${file}`, e);
  }
}

// --- Productos ---
app.get('/api/products', (req, res) => {
  const productos = leerJSON('products.json');
  res.json(productos);
});

app.post('/api/products/manual', (req, res) => {
  const { descripcion, precioCosto, precioVenta, precioMayoreo, inventario } = req.body;
  if (!descripcion || precioCosto == null || precioVenta == null || precioMayoreo == null || inventario == null) {
    return res.status(400).json({ error: 'Faltan datos para agregar producto manual' });
  }
  const productos = leerJSON('products.json');
  const nuevoId = Date.now().toString();
  const nuevoProducto = {
    id: nuevoId,
    title: descripcion,
    variants: [{
      id: nuevoId + '-v1',
      price: precioVenta,
      precioMayoreo,
      precioCosto,
      inventory_quantity: inventario,
    }],
  };
  productos.push(nuevoProducto);
  guardarJSON('products.json', productos);
  res.json({ mensaje: 'Producto manual agregado' });
});

// --- Usuarios ---
app.get('/api/users', (req, res) => {
  const usuarios = leerJSON('users.json');
  res.json(usuarios);
});

app.post('/api/users', (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: 'Email requerido' });
  const usuarios = leerJSON('users.json');
  if (usuarios.find(u => u.email === email)) {
    return res.status(400).json({ error: 'Usuario ya existe' });
  }
  usuarios.push({ id: Date.now().toString(), email });
  guardarJSON('users.json', usuarios);
  res.json({ mensaje: 'Usuario agregado' });
});

// Login simple (sin passwords)
app.post('/api/users/login', (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: 'Email requerido' });
  const usuarios = leerJSON('users.json');
  const usuario = usuarios.find(u => u.email === email);
  if (!usuario) return res.status(400).json({ error: 'Usuario no encontrado' });
  res.json({ ok: true, user: usuario });
});

// --- Apartados ---
app.get('/api/apartados', (req, res) => {
  const apartados = leerJSON('apartados.json');
  res.json(apartados);
});

app.post('/api/apartados', (req, res) => {
  const { nombre, total, abonado, diasRestantes } = req.body;
  if (!nombre || total == null || abonado == null || diasRestantes == null) {
    return res.status(400).json({ error: 'Datos incompletos para apartado' });
  }
  const apartados = leerJSON('apartados.json');
  apartados.push({
    id: Date.now().toString(),
    nombre,
    total,
    abonado,
    diasRestantes,
  });
  guardarJSON('apartados.json', apartados);
  res.json({ mensaje: 'Apartado agregado' });
});

app.delete('/api/apartados/:id', (req, res) => {
  const id = req.params.id;
  let apartados = leerJSON('apartados.json');
  const originalLength = apartados.length;
  apartados = apartados.filter(a => a.id !== id);
  if (apartados.length === originalLength) return res.status(404).json({ error: 'Apartado no encontrado' });
  guardarJSON('apartados.json', apartados);
  res.json({ mensaje: 'Apartado eliminado' });
});

// --- Promociones ---
app.get('/api/promociones', (req, res) => {
  const promociones = leerJSON('promos.json');
  res.json(promociones);
});

app.post('/api/promociones', (req, res) => {
  const { variantId, tipo, valor, descripcion } = req.body;
  if (!variantId || !tipo || valor == null || !descripcion) {
    return res.status(400).json({ error: 'Datos incompletos para promoción' });
  }
  const promociones = leerJSON('promos.json');
  promociones.push({
    id: Date.now().toString(),
    variantId,
    tipo,
    valor,
    descripcion,
  });
  guardarJSON('promos.json', promociones);
  res.json({ mensaje: 'Promoción agregada' });
});

// --- Ventas ---
app.get('/api/ventas', (req, res) => {
  const ventas = leerJSON('ventas.json');
  res.json(ventas);
});

app.post('/api/ventas', (req, res) => {
  const { carrito, metodoPago, esApartado } = req.body;
  if (!carrito || !Array.isArray(carrito) || !metodoPago) {
    return res.status(400).json({ error: 'Datos incompletos para registrar venta' });
  }
  const ventas = leerJSON('ventas.json');

  const nuevaVenta = {
    id: Date.now().toString(),
    carrito,
    metodoPago,
    esApartado: !!esApartado,
    fecha: new Date().toISOString(),
  };
  ventas.push(nuevaVenta);
  guardarJSON('ventas.json', ventas);

  // Si es apartado, agregar a apartados
  if (esApartado) {
    const apartados = leerJSON('apartados.json');
    carrito.forEach(item => {
      apartados.push({
        id: Date.now().toString() + Math.random().toString(36).substring(2),
        nombre: item.title,
        total: item.price * item.quantity,
        abonado: 0,
        diasRestantes: 7,
      });
    });
    guardarJSON('apartados.json', apartados);
  }

  res.json({ mensaje: 'Venta registrada correctamente' });
});

// --- Corte de caja ---
app.get('/api/corte', async (req, res) => {
  try {
    const ventas = leerJSON('ventas.json');
    const apartados = leerJSON('apartados.json');

    const workbook = new excelJS.Workbook();
    const worksheetVentas = workbook.addWorksheet('Ventas');
    const worksheetApartados = workbook.addWorksheet('Apartados');

    worksheetVentas.columns = [
      { header: 'ID Venta', key: 'id', width: 20 },
      { header: 'Fecha', key: 'fecha', width: 30 },
      { header: 'Método Pago', key: 'metodoPago', width: 15 },
      { header: 'Es Apartado', key: 'esApartado', width: 10 },
      { header: 'Productos', key: 'productos', width: 50 },
      { header: 'Total', key: 'total', width: 15 },
    ];

    ventas.forEach(venta => {
      const productosStr = venta.carrito.map(i => `${i.title} x${i.quantity}`).join(', ');
      const total = venta.carrito.reduce((acc, i) => acc + (i.price * i.quantity), 0);
      worksheetVentas.addRow({
        id: venta.id,
        fecha: venta.fecha,
        metodoPago: venta.metodoPago,
        esApartado: venta.esApartado ? 'Sí' : 'No',
        productos: productosStr,
        total: total.toFixed(2),
      });
    });

    worksheetApartados.columns = [
      { header: 'ID Apartado', key: 'id', width: 25 },
      { header: 'Nombre', key: 'nombre', width: 30 },
      { header: 'Total', key: 'total', width: 15 },
      { header: 'Abonado', key: 'abonado', width: 15 },
      { header: 'Días Restantes', key: 'diasRestantes', width: 15 },
    ];

    apartados.forEach(apartado => {
      worksheetApartados.addRow({
        id: apartado.id,
        nombre: apartado.nombre,
        total: apartado.total,
        abonado: apartado.abonado,
        diasRestantes: apartado.diasRestantes,
      });
    });

    const buffer = await workbook.xlsx.writeBuffer();

    res.setHeader('Content-Disposition', 'attachment; filename="corte_caja.xlsx"');
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.send(buffer);
  } catch (error) {
    console.error('Error generando corte:', error);
    res.status(500).json({ error: 'Error generando corte' });
  }
});

// --- Importar Excel ---
const upload = multer({ dest: 'uploads/' });

app.post('/api/importar', upload.single('archivo'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Archivo no enviado' });
  try {
    const workbook = XLSX.readFile(req.file.path);
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const datos = XLSX.utils.sheet_to_json(sheet);

    const productos = leerJSON('products.json');

    datos.forEach(row => {
      const desc = row.Descripcion || row.descripcion || row.DESCRIPCION;
      const precioCosto = parseFloat(row['precio costo'] || row['Precio Costo'] || row['PRECIO COSTO']);
      const precioVenta = parseFloat(row['precio venta'] || row['Precio Venta'] || row['PRECIO VENTA']);
      const precioMayoreo = parseFloat(row['precio mayoreo'] || row['Precio Mayoreo'] || row['PRECIO MAYOREO']);

      if (!desc || isNaN(precioCosto) || isNaN(precioVenta) || isNaN(precioMayoreo)) {
        return;
      }

      let prod = productos.find(p => p.title.toLowerCase() === desc.toLowerCase());
      if (prod) {
        prod.variants[0].precioCosto = precioCosto;
        prod.variants[0].price = precioVenta;
        prod.variants[0].precioMayoreo = precioMayoreo;
      } else {
        const nuevoId = Date.now().toString() + Math.floor(Math.random() * 1000);
        productos.push({
          id: nuevoId,
          title: desc,
          variants: [{
            id: nuevoId + '-v1',
            precioCosto,
            price: precioVenta,
            precioMayoreo,
            inventory_quantity: 0,
          }],
        });
      }
    });

    guardarJSON('products.json', productos);

    fs.unlinkSync(req.file.path);

    res.json({ mensaje: 'Archivo importado correctamente' });
  } catch (e) {
    console.error('Error importando Excel:', e);
    res.status(500).json({ error: 'Error al importar archivo Excel' });
  }
});

// --- Servir carpeta public ---
app.use(express.static(publicDir));

// --- Iniciar servidor ---
app.listen(PORT, () => {
  console.log(`Servidor backend corriendo en puerto ${PORT}`);
});