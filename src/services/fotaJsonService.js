import { supabase } from './supabase';

/**
 * SERVICIO FOTA JSON:
 * 1. Sube un perfil JSON a un bucket de Supabase Storage ('firmwares' o 'configs').
 * 2. Obtiene la URL pública directa HTTPS.
 * 3. Respalda el registro en la tabla 'perfiles_hardware' de Postgres.
 * 4. Envía la orden DOWNLOAD_JSON_SUPABASE al ESP32 por MQTT.
 */
export async function desplegarPerfilJsonFota({ mac, perfilNombre, tipo, jsonObject, sendCommand }) {
  try {
    const jsonString = JSON.stringify(jsonObject, null, 2);
    const blob = new Blob([jsonString], { type: 'application/json' });
    const fileName = `profiles/${mac.toUpperCase()}_HAL_${Date.now()}.json`;

    // 1. Subir al Bucket de Supabase Storage ('firmwares')
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('firmwares')
      .upload(fileName, blob, {
        upsert: true,
        contentType: 'application/json'
      });

    if (uploadError) throw new Error('Error subiendo archivo JSON a Supabase Storage: ' + uploadError.message);

    // 2. Obtener URL Pública
    const { data: urlData } = supabase.storage
      .from('firmwares')
      .getPublicUrl(fileName);

    const publicUrl = urlData?.publicUrl;
    if (!publicUrl) throw new Error('No se pudo generar la URL pública de descarga.');

    // 3. Respaldar en la tabla 'perfiles_hardware'
    await supabase.from('perfiles_hardware').insert({
      nombre: perfilNombre || `Perfil ${tipo} [${mac.slice(-4)}]`,
      hardware_rev: 'HKL-EA8_RJ45',
      perfil_json: { ...jsonObject, fota_url: publicUrl },
      activo: true
    });

    // 4. Enviar orden directa al ESP32 vía MQTT
    if (sendCommand) {
      sendCommand(mac, {
        cmd: 'DOWNLOAD_JSON_SUPABASE',
        url: publicUrl,
        mac: mac
      });
    }

    return { success: true, url: publicUrl };
  } catch (err) {
    console.error('[FOTA JSON SERVICE ERROR]', err);
    return { success: false, error: err.message };
  }
}
