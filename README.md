# Crucigrama

Aplicacion movil de crucigrama educativo construida con **Ionic + React + Capacitor**. Se distribuye como un archivo `.zip` que contiene el proyecto Android listo para compilar en Android Studio.

---

## Requisitos previos

- **Node.js** (v18 o superior)
- **npm**
- Paquetes globales: `@ionic/cli`

```bash
npm install -g @ionic/cli
```

---

## Instalacion de dependencias

```bash
npm install
```

---

## Archivo de configuracion

Antes de compilar, se debe crear el archivo de configuracion del crucigrama en:

```
public/config/crucigrama-config.json
```

Este archivo define las palabras, pistas, nivel de dificultad y metadatos del juego. La aplicacion lo carga al iniciar y sin el no es posible comenzar a jugar.

### Estructura del archivo

```json
{
  "nombreApp": "Nombre de la App",
  "nivel": "intermedio",
  "version": "1.0",
  "fecha": "2025-12-02",
  "descripcion": "Descripcion breve del juego",
  "plataformas": ["android"],
  "palabras": [
    {
      "answer": "PALABRA",
      "clue": "Pista para la palabra."
    }
  ]
}
```

### Opciones disponibles

| Propiedad | Tipo | Requerida | Descripcion |
|---|---|---|---|
| `nombreApp` | `string` | No | Nombre que se muestra en la cabecera del juego. |
| `nivel` | `string` | No | Nivel de dificultad. Valores: `"basico"`, `"intermedio"`, `"avanzado"` (tambien acepta `"basic"`, `"intermediate"`, `"advanced"`). Por defecto: `"basic"`. |
| `version` | `string` | No | Version del juego (ej. `"1.0"`). |
| `fecha` | `string` | No | Fecha de creacion en formato ISO (`"YYYY-MM-DD"`). |
| `descripcion` | `string` | No | Descripcion del juego. Se muestra en la pantalla de informacion. |
| `plataformas` | `string[]` | No | Plataformas soportadas (ej. `["android"]`). Se muestra en la pantalla de informacion. |
| `palabras` | `array` | No | Lista de palabras y pistas para el crucigrama. Tambien se acepta `"words"` como nombre alternativo. |

### Configuracion por nivel de dificultad

| Parametro | Basico | Intermedio | Avanzado |
|---|---|---|---|
| Tamano del tablero | 9 x 9 | 12 x 12 | 15 x 15 |
| Tiempo limite | 600s (10 min) | 1200s (20 min) | 1800s (30 min) |
| Palabras requeridas | 5 | 10 | 15 |
| Puntos por respuesta | 10 | 15 | 20 |

### Formato de cada palabra

Cada elemento del arreglo `palabras` debe tener:

| Campo | Alternativa | Descripcion |
|---|---|---|
| `answer` | `palabra` | La palabra en mayusculas (debe caber en el tablero segun el nivel). |
| `clue` | `pista` | La pista que se muestra al jugador. |

> **Nota:** Se aceptan tanto los nombres en ingles (`answer`, `clue`, `words`) como en espanol (`palabra`, `pista`, `palabras`).

---

## Build (generacion del ZIP)

Para generar el archivo `android-base.zip` listo para distribuir:

```bash
npm run build
```

### Que hace el proceso de build

El comando `npm run build` ejecuta los siguientes pasos en orden:

1. **`build:web`** — Compila la aplicacion web con Ionic/Vite. Genera los bundles optimizados (JS minificado, CSS, assets) en la carpeta `dist/`.

2. **`build:android`** — Inicializa el proyecto Android con Capacitor si la carpeta `android/` no existe.

3. **`build:android:sync`** — Copia los archivos compilados de `dist/` hacia `android/app/src/main/assets/public/`.

4. **`patch:capacitor`** — Aplica parches en los archivos Gradle del proyecto Android para corregir versiones de dependencias.

5. **`clean:assets`** — Elimina archivos innecesarios del proyecto Android para reducir el tamano del ZIP. Se eliminan:
   - Cache de Gradle (`.gradle/`)
   - Archivos de configuracion del IDE (`.idea/`)
   - Directorios de build intermedios (`app/build/`, `build/`, `capacitor-cordova-android-plugins/build/`)
   - Tests de Android (`app/src/androidTest/`, `app/src/test/`)
   - Propiedades locales (`local.properties`)
   - **Archivos de configuracion del crucigrama** (`crucigrama-config.json`, `crucigrama-config-example.json`) para evitar incluir datos de ejemplo en la distribucion.

6. **`zip:android`** — Comprime la carpeta `android/` en el archivo `android-base.zip`.

---