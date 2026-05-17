/**
 * headless_cli.js — Cliente Headless Nativo para Antigravity Deck
 * 
 * Este script utiliza los módulos internos del Deck para comunicarse
 * directamente con el Language Server (Opus) mediante streams gRPC/Connect.
 * 
 * Uso: node headless_cli.js <cascadeId> "<mensaje>" [modelId]
 */

const { sendMessage } = require('../src/cascade');
const { callApi } = require('../src/api');

async function main() {
    const args = process.argv.slice(2);
    if (args.length < 2) {
        console.error('Uso: node headless_cli.js <cascadeId> "<mensaje>" [modelId]');
        process.exit(1);
    }

    const cascadeId = args[0];
    const text = args[1];
    const modelId = args[2] || 'MODEL_PLACEHOLDER_M26';

    try {
        // 1. Enviar mensaje y esperar stream
        // console.error(`[Headless] Enviando a ${cascadeId} (${modelId})...`);
        const result = await sendMessage(cascadeId, text, { modelId, timeoutMs: 300000 });
        
        if (result.status !== 200) {
            console.error(`Error API: ${result.status}`);
            process.exit(1);
        }

        // 2. Procesar el stream de respuesta (Connect Protocol)
        // El stream devuelve múltiples objetos JSON concatenados.
        const rawData = result.data;
        const processed = processConnectStream(rawData);
        
        // 3. Imprimir solo el texto final para que sea capturado por el orquestador
        process.stdout.write(processed.text);
        
        // 4. Verificar si fue truncado por el LS (stopReason)
        if (processed.truncated) {
            // Aquí podríamos implementar el auto-continue recursivo si fuera necesario,
            // pero lo ideal es que el orquestador Gemini decida si pide más.
            // Por ahora, marcamos en stderr para depuración.
            console.error('\n[Headless] Advertencia: Respuesta truncada por el servidor.');
        }

    } catch (err) {
        console.error(`Error fatal: ${err.message}`);
        process.exit(1);
    }
}

/**
 * Procesa el stream de Connect Protocol para extraer el texto ensamblado.
 */
function processConnectStream(data) {
    let fullText = '';
    let isTruncated = false;
    
    // Connect stream suele enviar chunks JSON. 
    // Intentamos parsear por bloques (heurística simple para prototipo robusto).
    const lines = data.split('\n').filter(l => l.trim());
    
    for (const line of lines) {
        try {
            const json = JSON.parse(line);
            
            // Estructura de SendUserCascadeMessageResponse
            if (json.items) {
                for (const item of json.items) {
                    if (item.text) fullText += item.text;
                }
            }
            
            if (json.stopReason && json.stopReason !== 'stop' && json.stopReason !== 'end_turn') {
                isTruncated = true;
            }
        } catch (e) {
            // Si no es JSON puro, puede ser parte del protocolo binario de Connect
            // o simplemente ruido. En headless nativo buscamos el texto.
            continue;
        }
    }
    
    // Fallback: si no pudimos parsear JSON por líneas, buscamos patrones de texto
    if (!fullText) {
        // En algunos casos el stream viene como un solo bloque JSON gigante
        try {
            const json = JSON.parse(data);
            if (json.items) {
                fullText = json.items.map(i => i.text || '').join('');
            }
        } catch (e) {}
    }

    return { text: fullText, truncated: isTruncated };
}

main();
