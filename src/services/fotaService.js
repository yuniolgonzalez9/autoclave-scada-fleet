import { supabase } from './supabase';

/**
 * SERVICIO FOTA CLOUD PARA PERFILES HAL Y LITTLEFS
 * 
 * 1. Serializa y sanitiza el manifiesto JSON del hardware.
 * 2. Lo sube al Storage Bucket 'firmwares' de Supabase con URL pública HTTPS.
 * 3. Registra el manifiesto en la tabla Postgres 'perfiles_hardware'.
 * 4. Envía la orden DOWNLOAD_JSON_SUPABASE vía MQTT al Núcleo 1 del ESP32.
 */
export async function desplegarPerfilJsonFota({ mac, perfilNombre, tipo, jsonObject, sendCommand }) {
  try {
    if (!mac) throw new Error('Se requiere la dirección MAC del dispositivo destino.');
    if (!jsonObject || typeof jsonObject !== 'object') throw new Error('El manifiesto JSON suministrado no es válido.');

    const cleanMac = mac.toUpperCase().replace(/[:\-]/g, '');
    const timestamp = Date.now();
    const safeName = (perfilNombre || `perfil_${tipo || 'PLC'}`).toLowerCase().replace(/[^a-z0-9_-]/g, '_');
    const fileName = `profiles/${cleanMac}_${safeName}_${timestamp}.json`;

    const jsonString = JSON.stringify(jsonObject, null, 2);
    const blob = new Blob([jsonString], { type: 'application/json' });

    // 1. Subida al bucket de Supabase Storage ('firmwares')
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('firmwares')
      .upload(fileName, blob, {
        upsert: true,
        contentType: 'application/json',
        cacheControl: '3600'
      });

    if (uploadError) {
      throw new Error(`Error en Storage Supabase: ${uploadError.message}. Verifica que el bucket 'firmwares' exista y sea público.`);
    }

    // 2. Obtención de URL Pública de descarga HTTPS
    const { data: urlData } = supabase.storage
      .from('firmwares')
      .getPublicUrl(fileName);

    const publicUrl = urlData?.publicUrl;
    if (!publicUrl) throw new Error('No se pudo generar la URL pública de descarga desde la nube.');

    // 3. Respaldo histórico en la tabla 'perfiles_hardware'
    try {
      await supabase.from('perfiles_hardware').insert({
        nombre: perfilNombre || `Perfil ${tipo || 'Universal'} [${cleanMac.slice(-4)}]`,
        hardware_rev: 'HKL-EA8_RJ45',
        perfil_json: { ...jsonObject, fota_url: publicUrl, mac: cleanMac },
        activo: true
      });
    } catch (dbErr) {
      console.warn('[FOTA DB WARNING] No se pudo guardar en perfiles_hardware, pero el archivo se subió:', dbErr);
    }

    // 4. Despacho de la orden remota al ESP32 vía MQTT
    if (typeof sendCommand === 'function') {
      sendCommand(cleanMac, {
        cmd: 'DOWNLOAD_JSON_SUPABASE',
        url: publicUrl,
        mac: cleanMac,
        tipo: tipo || 'UNIVERSAL_PLC',
        timestamp
      });
    }

    return { 
      success: true, 
      url: publicUrl,
      fileName
    };

  } catch (err) {
    console.error('[FOTA SERVICE ERROR]', err);
    return { 
      success: false, 
      error: err.message || 'Error desconocido durante el despliegue FOTA.' 
    };
  }
}

// Exportación duplicada por compatibilidad si en tu proyecto se llama fotaJsonService
export const deployFotaJson = desplegarPerfilJsonFota;
