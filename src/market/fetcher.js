const fs = require('fs');
const path = require('path');
// Per fetch reali (già installato in Fase 0 come node-fetch@2 o globale Node 18+)
// const fetch = require('node-fetch'); 

// Configurazione
const CONFIG = {
    ttlCache: 60 * 60 * 1000, // 1 ora
    mockMode: process.env.ENABLE_REALTIME_MARKET !== 'true' // Default: true (sicuro)
};

// Cache in memoria
let cache = {
    data: null,
    timestamp: 0
};

/**
 * Simula dati di mercato realistici (per evitare errori API in ambiente dev)
 * Restituisce dati che oscillano leggermente per mostrare il widget vivo
 */
function getMockData() {
    return {
        euribor_3m: 3.895 + (Math.random() * 0.01), // ~3.90%
        tegm_corrente: 8.56, // Esempio per mutuo ipotecario
        timestamp: new Date().toISOString(),
        fonte: 'Simulazione BBRE (Mock)',
        warning: null
    };
}

/**
 * Fetch Reale (Placeholder per implementazione produzione)
 * Per usare dati veri, setta ENABLE_REALTIME_MARKET=true in .env
 */
async function fetchRealData() {
    try {
        // Qui andrebbe la logica complessa per parsare l'API della BCE
        // Esempio: const res = await fetch('https://api.ecb...');
        // Per ora, per stabilità del tuo progetto, restituiamo mock anche qui 
        // se non hai una chiave API valida configurata.
        return getMockData(); 
    } catch (err) {
        console.error('❌ Errore fetch reale:', err);
        return getMockData(); // Fallback a mock
    }
}

async function getMarketData() {
    const now = Date.now();

    // 1. Verifica Cache
    if (cache.data && (now - cache.timestamp < CONFIG.ttlCache)) {
        console.log('📈 Dati mercato dalla Cache');
        return { ...cache.data, fromCache: true };
    }

    console.log('🌐 Aggiornamento dati mercato...');

    // 2. Fetch (Mock o Reale)
    const data = CONFIG.mockMode ? getMockData() : await fetchRealData();

    // 3. Aggiorna Cache
    cache.data = data;
    cache.timestamp = now;

    return { ...data, fromCache: false };
}

module.exports = { getMarketData };
