const BOT_TOKEN = import.meta.env.VITE_TELEGRAM_BOT_TOKEN || '8902369071:AAFuFn3R1b6k9_y_2w3XKPc92npVRUkee0s';
const CHAT_ID = import.meta.env.VITE_TELEGRAM_CHAT_ID || '685508990';

export const sendTelegramAlert = async (mensaje) => {
  try {
    const url = `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`;
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: CHAT_ID,
        text: mensaje,
        parse_mode: 'HTML'
      })
    });
    return await response.json();
  } catch (error) {
    console.warn('Alerta Telegram en modo local/offline:', error);
  }
};
