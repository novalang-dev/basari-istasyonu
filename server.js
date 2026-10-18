const express = require('express');
const webpush = require('web-push');
const { createClient } = require('@supabase/supabase-js');
const cron = require('node-cron');
const path = require('path');

const app = express();
app.use(express.json());

// Public klasörünü (HTML, SW, ikonlar) dışarıya açar
app.use(express.static(path.join(__dirname, 'public')));

// VAPID Yapılandırması (Render'daki Environment Variables'tan çekilecek)
webpush.setVapidDetails(
  'mailto:sizin-emailiniz@gmail.com', // BURAYA KENDİ E-POSTANIZI YAZIN
  process.env.VAPID_PUBLIC_KEY,
  process.env.VAPID_PRIVATE_KEY
);

// Supabase Bağlantısı (service_role anahtarı ile)
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } }
);

// 1. Cihazdan gelen aboneliği Supabase'e kaydet
app.post('/api/subscribe', async (req, res) => {
  const { endpoint, keys, device_label } = req.body;
  if (!endpoint || !keys?.p256dh || !keys?.auth) {
    return res.status(400).json({ error: 'Geçersiz abonelik verisi' });
  }

  const { error } = await supabase.from('push_subscriptions').upsert({
    endpoint,
    p256dh: keys.p256dh,
    auth: keys.auth,
    device_label: device_label || 'unknown'
  }, { onConflict: 'endpoint' });

  if (error) {
    console.error('Abonelik kaydetme hatası:', error);
    return res.status(500).json({ error: error.message });
  }
  res.json({ ok: true });
});

// 2. VAPID Public Key'i ön yüze (HTML'e) gönder
app.get('/api/vapid-public-key', (req, res) => {
  res.json({ publicKey: process.env.VAPID_PUBLIC_KEY });
});

// 3. Her 5 dakikada bir çalışan Zamanlanmış Görev (Cron)
cron.schedule('*/5 * * * *', async () => {
  console.log('[Cron] Bildirim kontrolü başladı:', new Date().toISOString());

  try {
    const now = new Date();
    const in25h = new Date(now.getTime() + 25 * 60 * 60 * 1000);

    // Yaklaşan etkinlikleri al
    const { data: events, error: evError } = await supabase
      .from('events')
      .select('*')
      .gte('date', now.toISOString().split('T')[0])
      .lte('date', in25h.toISOString().split('T')[0]);

    if (evError) { console.error('Etkinlik okuma hatası:', evError); return; }
    if (!events || events.length === 0) return;

    // Kayıtlı tüm cihazları (abonelikleri) al
    const { data: subs, error: subError } = await supabase
      .from('push_subscriptions')
      .select('*');

    if (subError) { console.error('Abonelik okuma hatası:', subError); return; }
    if (!subs || subs.length === 0) return;

    for (const ev of events) {
      const evDate = new Date(ev.date + 'T00:00:00');
      const hoursLeft = (evDate - now) / (1000 * 60 * 60);

      // Eşik kontrolleri (1 gün, 12 saat, 6 saat)
      const thresholds = [];
      if (hoursLeft <= 24 && hoursLeft > 12) thresholds.push({ label: '24h', title: '⏰ Yarın bir etkinlik var', body: `"${ev.title}" yarın gerçekleşecek.` });
      if (hoursLeft <= 12 && hoursLeft > 6) thresholds.push({ label: '12h', title: '⚠️ Son 12 saat', body: `"${ev.title}" etkinliğine 12 saatten az kaldı.` });
      if (hoursLeft <= 6 && hoursLeft > 0) thresholds.push({ label: '6h', title: '🚨 Kritik: Son 6 saat', body: `"${ev.title}" etkinliğine son 6 saat!` });

      for (const th of thresholds) {
        // Daha önce gönderildi mi?
        const { data: existing } = await supabase
          .from('notifications_sent')
          .select('id')
          .eq('event_id', ev.id)
          .eq('offset_label', th.label)
          .maybeSingle();

        if (existing) continue;

        // Tüm cihazlara push gönder
        for (const sub of subs) {
          const pushSubscription = {
            endpoint: sub.endpoint,
            keys: { p256dh: sub.p256dh, auth: sub.auth }
          };

          try {
            await webpush.sendNotification(pushSubscription, JSON.stringify({
              title: th.title,
              body: th.body,
              url: '/index.html'
            }));
            console.log(`[Push] ${ev.id} ${th.label} → ${sub.device_label} gönderildi`);
          } catch (pushErr) {
            console.error(`[Push] Hata:`, pushErr.statusCode);
            if (pushErr.statusCode === 410) {
              await supabase.from('push_subscriptions').delete().eq('id', sub.id);
            }
          }
        }

        // Gönderildi olarak işaretle
        await supabase.from('notifications_sent').insert({ event_id: ev.id, offset_label: th.label });
      }
    }
  } catch (err) {
    console.error('[Cron] Hata:', err);
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Sunucu ${PORT} portunda çalışıyor`);
});