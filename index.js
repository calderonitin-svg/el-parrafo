const express = require('express');
const https = require('https');
const app = express();
const port = process.env.PORT || 3000;


// Dejamos los 3 grandes feeds más estables y masivos de texto plano en Colombia
const medios = {
    "La Silla Vacía": "https://www.lasillavacia.com/feed/",
    "El Tiempo": "https://www.eltiempo.com/rss/colombia.xml",
    "El Espectador": "https://www.elespectador.com/arc/outboundfeeds/rss/?outputType=xml"
};

let noticiasAlmacenadas = {};
Object.keys(medios).forEach(m => {
    noticiasAlmacenadas[m] = { exito: false, noticias: [], error: "Sincronizando..." };
});

function descargarMedio(nombre, url) {
    return new Promise((resolve) => {
        // Añadimos un User-Agent simulando un navegador real para evitar bloqueos de seguridad
        const opciones = {
            headers: { 'User-Agent': 'Mozilla/5.0 (Linux; Android 10) ElParrafoApp/1.0' }
        };
        const req = https.get(url, opciones, (res) => {
            let datos = '';
            res.on('data', (chunk) => { datos += chunk; });
            res.on('end', () => {
                if (datos.length > 300) resolve({ nombre, datos, exito: true });
                else resolve({ nombre, exito: false, error: "Estructura vacía" });
            });
        });
        req.on('error', () => { resolve({ nombre, exito: false, error: "Error de conexión" }); });
        req.setTimeout(3000, () => { req.destroy(); resolve({ nombre, exito: false, error: "Sin respuesta" }); });
    });
}

function extraerNoticias(xmlTexto) {
    const listaNoticias = [];
    const itemRegex = /<item>([\s\S]*?)<\/item>/g;
    let itemMatch;
    
    while ((itemMatch = itemRegex.exec(xmlTexto)) !== null) {
        const contenidoItem = itemMatch[1];
        
        const titleRegex = /<title>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/;
        const titleMatch = titleRegex.exec(contenidoItem);
        
        const linkRegex = /<link>([\s\S]*?)<\/link>/;
        const linkMatch = linkRegex.exec(contenidoItem);
        
        if (titleMatch && linkMatch) {
            let tituloLimpio = titleMatch[1].trim()
                .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
                .replace(/&quot;/g, '"').replace(/&#039;/g, "'")
                .replace(/<!\[CDATA\[/g, '').replace(/\]\]>/g, '');
            
            let linkLimpio = linkMatch[1].trim().replace(/<!\[CDATA\[/g, '').replace(/\]\]>/g, '');
            listaNoticias.push({ titulo: tituloLimpio, url: linkLimpio });
        }
        if (listaNoticias.length >= 3) break;
    }
    return listaNoticias;
}

async function actualizarNoticias() {
    for (const nombre of Object.keys(medios)) {
        const resultado = await descargarMedio(nombre, medios[nombre]);
        if (resultado.exito) {
            const noticias = extraerNoticias(resultado.datos);
            if (noticias.length > 0) {
                noticiasAlmacenadas[nombre] = { exito: true, noticias: noticias };
            } else {
                noticiasAlmacenadas[nombre] = { exito: false, noticias: [], error: "Formato ilegible" };
            }
        } else {
            if (!noticiasAlmacenadas[nombre].exito) {
                noticiasAlmacenadas[nombre] = { exito: false, noticias: [], error: resultado.error };
            }
        }
    }
}

// Carga inicial rápida y actualización en segundo plano
actualizarNoticias();
setInterval(actualizarNoticias, 300000);

app.get('/', (req, res) => {
    let html = `
    <!DOCTYPE html>
    <html lang="es">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0, user-scalable=no">
        <title>El Párrafo</title>
        <style>
            body { 
                font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; 
                background-color: #111112; 
                margin: 0; 
                padding: 16px; 
                color: #e1e1e4;
                -webkit-tap-highlight-color: transparent;
            }
            
            header {
                text-align: center;
                padding: 24px 0 12px 0;
                margin-bottom: 20px;
            }
            header h1 { 
                font-family: "Georgia", serif;
                color: #ff6b4a; 
                font-size: 30px; 
                margin: 0;
                font-weight: 700;
                letter-spacing: -0.5px;
            }
            header .tagline { 
                font-size: 10px; 
                color: #7c7c82; 
                text-transform: uppercase;
                letter-spacing: 2px;
                margin-top: 6px;
            }

            .feed-container { max-width: 480px; margin: 0 auto; }

            .medio-card { 
                background: #1a1a1c; 
                padding: 16px; 
                margin-bottom: 16px; 
                border-radius: 12px; 
                border: 1px solid #262629;
            }
            
            .medio-titulo { 
                font-size: 14px; 
                font-weight: 700; 
                color: #ffffff; 
                border-left: 3px solid #ff6b4a;
                padding-left: 10px;
                margin-bottom: 14px; 
                text-transform: uppercase;
                letter-spacing: 0.5px;
            }
            
            ul { list-style: none; padding: 0; margin: 0; }
            li { border-bottom: 1px solid #262629; padding: 12px 0; }
            li:last-child { border-bottom: none; padding-bottom: 0; }
            li:first-child { padding-top: 0; }
            
            .noticia-link { 
                color: #e1e1e4; 
                text-decoration: none; 
                display: block; 
                font-size: 14.5px;
                line-height: 1.45;
            }
            .noticia-link:active { color: #ff8469; }
            
            .error { color: #ff5555; font-size: 12px; margin: 0; opacity: 0.6; }
        </style>
    </head>
    <body>
        <header>
            <h1>El Párrafo</h1>
            <div class="tagline">La esencia de la noticia en texto plano</div>
        </header>

        <div class="feed-container">
    `;

    Object.keys(noticiasAlmacenadas).forEach(nombre => {
        const info = noticiasAlmacenadas[nombre];
        html += `<div class="medio-card">`;
        html += `<div class="medio-titulo">${nombre}</div>`;
        
        if (info.exito) {
            html += `<ul>`;
            info.noticias.forEach(noticia => { 
                html += `<li><a class="noticia-link" href="${noticia.url}">${noticia.titulo}</a></li>`; 
            });
            html += `</ul>`;
        } else {
            html += `<p class="error">${info.error}</p>`;
        }
        html += `</div>`;
    });

    html += `</div></body></html>`;
    res.send(html);
});

app.listen(port, '0.0.0.0', () => {
    console.log(`El Párrafo corriendo con total estabilidad en puerto ${port}`);
});

