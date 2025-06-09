// Importa las funciones necesarias
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.11.0/firebase-app.js";
import { getDatabase }     from "https://www.gstatic.com/firebasejs/10.11.0/firebase-database.js";
import { getAnalytics }    from "https://www.gstatic.com/firebasejs/10.11.0/firebase-analytics.js";

// Configuración de tu proyecto Firebase
const firebaseConfig = {
  apiKey: "AIzaSyCsJ7UaZdEJJ_akmYbxvBv_7QVP2slU-0Y",
  authDomain: "distribuciones-roca.firebaseapp.com",
  projectId: "distribuciones-roca",
  storageBucket: "distribuciones-roca.appspot.com", // Corregido: terminaba en `.app`, debe ser `.appspot.com`
  messagingSenderId: "788736919409",
  appId: "1:788736919409:web:667e55aab9ac195d3798d0",
  measurementId: "G-XCY6HZLCC0",
  databaseURL: "https://distribuciones-roca-default-rtdb.firebaseio.com" // Agregado para Realtime DB
};

// Inicializar Firebase
export const app = initializeApp(firebaseConfig);

// Inicializar Realtime Database
const db = getDatabase(app);

// Inicializar Analytics (opcional, solo si lo usas)
const analytics = getAnalytics(app);

// Exportar la base de datos para usarla en otros archivos
export { db };



