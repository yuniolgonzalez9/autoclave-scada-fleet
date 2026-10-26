import { supabase } from './supabase';

export async function desplegarPerfilJsonFota({ mac, perfilNombre, tipo, jsonObject, sendCommand }) {
  try {
    if (!mac) throw new Error('Se requiere la dirección MAC del equipo.');
    const cleanMac = mac.toUpperCase().replace(/[:\-]/g, '');
    const fileName = `profiles/${cleanMac}_${Date.now()}.json`;

    const blob = new Blob([JSON.stringify(jsonObject, null, 2)], { type: 'application/json' });

    const { error: uploadError } = await supabase.storage
      .from('firmwares')
      .upload(fileName, blob, { upsert: true, contentType: 'application/json' });

    if (uploadError) throw uploadError;

    const { data: urlData } = supabase.storage.from('firmwares').getPublicUrl(fileName);
    const publicUrl = urlData?.publicUrl;

    try {
      await supabase.from('perfiles_hardware').insert({
        nombre: perfilNombre || `Perfil ${tipo} [${cleanMac.slice(-4)}]`,
        hardware_rev: 'HKL-EA8_RJ45',
        perfil_json: { ...jsonObject, fota_url: publicUrl, mac: cleanMac },
        activo: true
      });
    } catch (_) {}

    if (typeof sendCommand === 'function') {
      sendCommand(cleanMac, {
        cmd: 'DOWNLOAD_JSON_SUPABASE',
        url: publicUrl,
        mac: cleanMac
      });
    }

    return { success: true, url: publicUrl };
  } catch (err) {
    return { success: false, error: err.message };
  }
}
