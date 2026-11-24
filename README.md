# Mi Biblioteca

App web para registrar mis libros, música (CD, vinilo, casete), cine y series (DVD, Blu-ray, 4K UHD, grabadas) y juegos de mesa, con vista de portadas o lista compacta, filtros, préstamos y ubicación. Funciona en el móvil, se puede instalar en la pantalla de inicio y sigue funcionando sin conexión.

## Publicar en GitHub Pages

1. Crea un repositorio nuevo en GitHub, por ejemplo `mi-biblioteca`.
2. Sube **todos** los archivos de esta carpeta a la raíz del repositorio (botón *Add file → Upload files*, arrastra los archivos y la carpeta `icons`).
3. Ve a **Settings → Pages**. En *Build and deployment* elige *Deploy from a branch*, rama `main` y carpeta `/ (root)`. Guarda.
4. En uno o dos minutos la app estará en `https://TU-USUARIO.github.io/mi-biblioteca/`.

## Instalar en el móvil

- **iPhone (Safari):** abre la dirección, pulsa *Compartir* → *Añadir a pantalla de inicio*.
- **Android (Chrome):** abre la dirección y pulsa *Instalar* en el aviso de la app (o menú ⋮ → *Instalar aplicación*).

> **iPhone:** Safari y la app instalada guardan los datos **por separado**, y Safari puede borrar los datos de webs que no visitas en 7 días. Instálala en la pantalla de inicio antes de empezar a añadir cosas, o conecta GitHub (ver abajo) para tener los datos en ambos sitios.

## Uso

- **Apartados:** en la barra inferior tienes *Libros*, *Música*, *Cine y series* y *Juegos*, con el botón **+** en el centro para añadir (se abre ya con el apartado en el que estés). Para ver toda la biblioteca junta, toca el logo «Mi Biblioteca» o vuelve a tocar el apartado activo.
- **+** para añadir. Elige el tipo y, en música y cine, el **Formato** en su desplegable:
  - Libro
  - Música: CD, Vinilo o Casete
  - Cine y series: elige en *¿Película o serie?* y el formato (DVD, Blu-ray, 4K UHD o Grabada). En las series el campo *Director* pasa a llamarse *Creador* y aparece *Temporada(s)* (p. ej. «1–3» o «Completa»); distintas temporadas de una misma serie no se avisan como duplicadas.
- **Escanear ISBN (solo libros):** en *Añadir* con el tipo *Libro*, pulsa *Escanear ISBN del libro* y apunta la cámara al código de barras de la contraportada. La app rellena título, autor, año, género y portada. También puedes escribir el ISBN y pulsar *Buscar datos*. En Música y Películas no aparece el escáner.
- **¿Ya lo tengo?** En la lupa, el botón del código de barras escanea el ISBN de un libro (por ejemplo, en una librería): si está en tu biblioteca abre su ficha; si no, te ofrece añadirlo con los datos ya rellenados.
- **Juegos de mesa:** al elegir *Juego*, la ficha pide título, editorial, jugadores (de… a…), duración en minutos, edad mínima y descripción, además de precio/regalo y ubicación. La portada se pone con *Pegar URL de imagen* (por ejemplo, copiando la imagen de la caja desde la web de la tienda o la editorial). En el apartado Juegos hay un desplegable *Jugadores*: al elegir «5» verás los juegos que admiten 5 personas («6 o más» para grupos grandes).
- **Portada:** búscala desde la app (libros en Open Library; música en iTunes; películas en TMDB, Wikipedia e iTunes a la vez, indicando de dónde sale cada una) o pega la URL de una imagen de internet (mantén pulsada la imagen en el navegador → *Copiar dirección de la imagen*). La app comprueba que la imagen carga. Si no hay portada, genera una con el título.
- **Ubicación:** dónde está guardado (p. ej. «Salón, estantería 2»). La app te sugiere las ubicaciones que ya usaste.
- **Duplicados:** si añades algo que ya tienes (mismo tipo y título), la app te avisa antes de guardar.
- **Leído / visto:** en libros y películas, pulsa *Marcar como leído* (o *Marcar como vista*) en la ficha, o marca la casilla «Ya lo he leído» / «Ya la he visto» al añadir o editar. Las portadas muestran una marca verde. Debajo de los filtros tienes *Por leer* / *Leídos* en Libros, *Por ver* / *Vistas* en Cine y series y *Pendientes* / *Leídos y vistos* en Todo (tócalo otra vez para quitar el filtro). En el menú ⋯ verás cuántos llevas.
- **Precio y regalos:** al añadir o editar puedes apuntar lo que pagaste (p. ej. 18,90). Si fue un regalo, marca *Me lo regalaron* y, si quieres, de quién; entonces no se pide precio. La ficha muestra el precio o «Regalo de…», y al entrar en Libros, Música o Películas verás el total gastado en ese apartado y sus regalos (nunca se suman apartados distintos; en el menú ⋯ aparece el desglose por apartado). La búsqueda también encuentra por «regalo» o por el nombre de quien te lo regaló.
- **Préstamos:** en la ficha de un elemento, *Prestar* → a quién y desde cuándo. La portada muestra una cinta amarilla «Prestado · nombre», y el filtro **Prestados** (en la fila de filtros) reúne lo que tienes prestado en el apartado actual. *Devuelto* lo guarda en el historial de préstamos.
- **Borrar:** se borra al momento y tienes unos segundos para pulsar *Deshacer*.
- **Filtros:** dentro de cada apartado (la pantalla principal no tiene filtros), debajo de la cabecera: formato (Música y Cine y series), *Ver: Todo / Películas / Series* (Cine y series), *Jugadores* (Juegos), leído/visto y *Prestados*. La app recuerda el último apartado.
- **Vista:** el botón de la cabecera cambia entre portadas y lista compacta (con formato, préstamo y ubicación a la vista).
- **Lupa:** busca por título, autor, artista, género, año, ubicación, notas o persona a la que lo prestaste.
- **Ordenar por título** ignora los artículos iniciales («El», «La», «Los», «Un», «The»…): *El laberinto del fauno* se ordena en la L.
- **Inventario para Excel:** *⋯ → Exportar inventario (Excel)* descarga un archivo `.csv` con todo (apartado, tipo, título, autor, año, formato, temporadas, ISBN, datos de juegos, ubicación, precio, regalos, leído, préstamos, notas…). Se abre directamente en Excel o Numbers; en el móvil se abre el menú de compartir para guardarlo en Archivos o enviarlo por correo.
- **Menú ⋯:** ordenar, copia de seguridad, sincronización con GitHub y resumen de la colección.

## De dónde salen los datos y las portadas

| Qué | Servicios |
|---|---|
| Libros por ISBN (escáner) | Google Books y Open Library |
| Portadas de libros por título | Open Library |
| Portadas de música | iTunes |
| Portadas de cine y series | TMDB (si pones tu clave), Wikipedia en español e inglés, e iTunes (España y, si hay pocos resultados, EE. UU.) |

La lectura del código de barras se hace en el propio móvil: Chrome en Android usa su lector integrado y en iPhone se usa la librería ZXing incluida en la carpeta `vendor/` (funciona sin conexión). La primera vez el navegador pedirá permiso para usar la cámara.

### Clave gratuita de TMDB (recomendada para películas)

TMDB (The Movie Database) tiene el cartel de casi cualquier película o serie, a menudo en español. Su uso es gratuito para fines personales, pero pide una clave:

1. Crea una cuenta en [themoviedb.org](https://www.themoviedb.org/signup) y confirma tu correo.
2. Ve a tu avatar → **Ajustes** → **API** → **Solicitar una clave de API**. Elige **Developer** (uso personal) y acepta las condiciones.
3. Rellena el formulario: tipo de uso personal; como URL de la aplicación puedes poner la de tu app (`https://TU-USUARIO.github.io/mi-biblioteca/`).
4. En esa misma página aparecerán la **Clave de la API** y el **Token de acceso de lectura**. Copia cualquiera de los dos.
5. En la app: **⋯ → Portadas de cine y series**, pega la clave y pulsa **Guardar**. La app comprueba que funciona.

La clave se guarda solo en ese dispositivo: si usas la app en varios, pégala en cada uno.

> Este producto usa la API de TMDB, pero no está avalado ni certificado por TMDB.

## Tus datos: sincronización con GitHub

La biblioteca se guarda en el móvil y, si la conectas, también en un archivo `biblioteca.json` de un **repositorio privado** de GitHub. Así tienes copia en la nube, historial de cada cambio y la misma biblioteca en todos tus dispositivos.

### 1. Crea el repositorio de datos (privado)

1. En GitHub: **+ → New repository**.
2. Nombre: `mi-biblioteca-datos`. Marca **Private** y **Add a README file**. Crear.

> Usa un repositorio distinto del de la app: el de la app tiene que ser público para que GitHub Pages funcione gratis, y no quieres que tu lista sea pública.

### 2. Crea un token de acceso

1. GitHub → foto de perfil → **Settings → Developer settings → Personal access tokens → Fine-grained tokens → Generate new token**.
2. *Token name*: `Mi Biblioteca`. *Expiration*: la que prefieras (cuando caduque, crea otro y vuelve a conectar).
3. *Repository access*: **Only select repositories** → `mi-biblioteca-datos`.
4. *Permissions → Repository permissions → Contents*: **Read and write**.
5. **Generate token** y copia el código (`github_pat_…`). Solo se muestra una vez.

### 3. Conecta la app

En la app: **⋯ → Sincronizar con GitHub**. Escribe tu usuario, `mi-biblioteca-datos` y pega el token. Pulsa **Conectar**.

Repite el paso 3 en cada dispositivo (puedes usar el mismo token). Lo que hubiera en cada uno se junta en el archivo.

### Cómo funciona

- Cada vez que añades, editas o borras algo, la app lo sube a GitHub a los pocos segundos.
- Al abrir la app (o volver a ella), descarga los cambios hechos desde otros dispositivos.
- Sin conexión puedes seguir usándola: los cambios se suben cuando vuelve la red.
- La nube de la cabecera indica el estado: punto **verde** sincronizado, **amarillo** cambios pendientes, **gris** sin conexión, **rojo** error (tócala para ver el motivo y reintentar).
- Si editas en dos dispositivos, se queda la versión más reciente de cada elemento. Los borrados se recuerdan para que no reaparezcan.
- Cada cambio es un commit, así que en GitHub puedes ver el historial y recuperar versiones anteriores.

El token se guarda solo en el navegador de cada dispositivo y únicamente da acceso al repositorio de datos.

### Copia manual

**⋯ → Exportar / Importar** sigue disponible para descargar o recuperar la biblioteca en un `.json`, con o sin GitHub.

## Actualizar la app

Si cambias algún archivo, sube en `sw.js` el valor de `VERSION` (p. ej. de `mb-v13` a `mb-v14`). Al abrir la app, los móviles mostrarán «Hay una nueva versión de la app · Actualizar».

## Archivos

| Archivo | Qué es |
|---|---|
| `index.html` | Estructura de la app |
| `styles.css` | Diseño (modo claro y oscuro) |
| `app.js` | Lógica: guardar, filtrar, buscar portadas, sincronizar con GitHub, copias |
| `sw.js` | Funcionamiento sin conexión |
| `manifest.webmanifest` | Nombre e icono al instalarla |
| `icons/` | Logo e iconos |
| `vendor/` | Lector de ISBN para iPhone (barcode-detector + ZXing, licencia MIT) |
