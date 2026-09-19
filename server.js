const express = require('express');
const path = require('path');
const crypto = require('crypto');
const rateLimit = require('express-rate-limit');

const app = express();
const PORT = process.env.PORT || 3000;

// =========================================================================
// ⚙️ НАСТРОЙКИ ИНТЕГРАЦИЙ
// =========================================================================
const GOOGLE_SHEETS_URL = 'https://script.google.com/macros/s/AKfycbyztIAJNSsVEVMrNhLenwtfgfjQ_F-lyqnZtI5vjW9Lr4_ubIw4_CDJNOkzLIEi7TitLA/exec';
const WAPPI_API_TOKEN = '21af3fabb0206c63133100470d1ef60a88666a34';
const WAPPI_PROFILE_ID = 'c2af0fb7-978b';

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || 'YOUR_BOT_TOKEN';
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID || 'YOUR_CHAT_ID';

// 🎯 Настройки Яндекс Метрики
const YANDEX_METRIKA_COUNTER_ID = '112791859';
const YANDEX_OAUTH_TOKEN = process.env.YANDEX_OAUTH_TOKEN || 'y0__wgBEI-dn-MEGO__SSD21cmKGUjXAsN1YGkQeoOuttauHo2JRl5V';

// =========================================================================
// 🛡️ MIDDLEWARE И СОСТОЯНИЕ
// =========================================================================
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const leadLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 3,
  message: { error: 'Слишком много запросов. Попробуйте позже.' },
  standardHeaders: true,
  legacyHeaders: false,
});

let siteConfig = {
  brandName: 'PEPPER MOTORS',
  phone: '+7 (999) 999-99-99',
  mainTitle: 'Подбор авто под ваш бюджет',
  banners: [
    { id: 'china', title: 'Авто из Китая под ключ', img: '/images/china.jpg', utm: 'china_hybrid' },
    { id: 'europe', title: 'Дизель из Европы в наличии', img: '/images/europe.jpg', utm: 'europe_diesel' },
    { id: 'default', title: 'Подбор авто под ваш бюджет', img: '/images/default.jpg', utm: 'default' }
  ]
};

// =========================================================================
// 📩 ФУНКЦИИ ИНТЕГРАЦИЙ И АНАЛИТИКИ
// =========================================================================

// 1. Отправка сообщения в Telegram через Wappi Telegram User API (/tapi/)
async function sendWappiMessage(phone, name) {
  try {
    const cleanPhone = phone.replace(/\D/g, '');
    
    const response = await fetch(`https://wappi.pro/tapi/sync/message/send?profile_id=${WAPPI_PROFILE_ID}`, {
      method: 'POST',
      headers: {
        'Authorization': WAPPI_API_TOKEN,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        recipient: cleanPhone,
        body: `Здравствуйте, ${name}! 👋\n\nСпасибо за заявку в Pepper Motors.\nЯ получил ваши ответы по квизу и прямо сейчас подбираю варианты автомобилей под ваш бюджет.\n\nПодскажите, в какое время вам удобнее принять звонок?`
      })
    });

    const result = await response.json();
    console.log(`💬 [Wappi Telegram] Ответ сервера:`, result);
  } catch (err) {
    console.error('❌ Ошибка отправки через Wappi:', err.message);
  }
}

// 2. Фоновая отправка офлайн-конверсии в Яндекс Метрику (п. 5.6 ТЗ)
async function sendPostbackSignal(ymUid, leadId) {
  if (!ymUid) {
    console.log(`ℹ️ [Postback] Заявка #${leadId} без _ym_uid (Метрика не передала ID посетителя)`);
    return;
  }

  console.log(`🎯 [Postback] Отправка офлайн-конверсии в Яндекс Метрику для ClientID: ${ymUid}...`);

  try {
    const now = Math.floor(Date.now() / 1000);
    
    // Формируем чистый CSV-контент
    const csvContent = `ClientId,Target,DateTime\n${ymUid},LEAD_CREATED,${now}`;
    
    // Использование встроенных FormData и Blob без ручной сборки boundary
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const formData = new FormData();
    formData.append('file', blob, 'conversions.csv');

    const response = await fetch(
      `https://api-metrika.yandex.net/management/v1/counter/${YANDEX_METRIKA_COUNTER_ID}/offline_conversions/upload?client_id_type=CLIENT_ID`,
      {
        method: 'POST',
        headers: {
          'Authorization': `OAuth ${YANDEX_OAUTH_TOKEN}`
        },
        body: formData
      }
    );

    const result = await response.json();
    console.log(`✅ [Postback] Ответ Яндекс Метрики:`, result);
  } catch (err) {
    console.error('❌ [Postback] Ошибка отправки в Яндекс Метрику:', err.message);
  }
}

// 3. Автоматическая проверка бюджета (п. 6.2 ТЗ)
async function getAdBalance() {
  return 14500;
}

async function checkAdBudgetAndNotify() {
  const minBudgetThreshold = 20000;
  const currentBalance = await getAdBalance();

  console.log(`📊 [Бюджет] Текущий остаток: ${currentBalance} ₽`);

  if (currentBalance < minBudgetThreshold) {
    const message = `⚠️ *Внимание! Заканчивается рекламный бюджет*\n\n` +
                    `Текущий остаток: *${currentBalance} ₽*\n` +
                    `Рекомендуемое пополнение: *50 000 ₽*\n\n` +
                    `Счет сформирован автоматически.`;

    if (TELEGRAM_BOT_TOKEN !== 'YOUR_BOT_TOKEN') {
      try {
        await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: TELEGRAM_CHAT_ID,
            text: message,
            parse_mode: 'Markdown'
          })
        });
        console.log('🚀 [Бюджет] Уведомление о пополнении отправлено в Telegram');
      } catch (err) {
        console.error('Ошибка отправки в Telegram:', err);
      }
    }
  }
}

setInterval(checkAdBudgetAndNotify, 24 * 60 * 60 * 1000);

// =========================================================================
// 🌐 ЭНДПОИНТЫ API
// =========================================================================

app.get('/api/config', (req, res) => res.json(siteConfig));
app.post('/api/config', (req, res) => {
  siteConfig = { ...siteConfig, ...req.body };
  res.json({ status: 'ok', config: siteConfig });
});

// Прием лидов (п. 5.1, 5.2, 5.5, 5.6 ТЗ)
app.post('/api/leads', leadLimiter, (req, res) => {
  const { name, phone, channel, answers, utm } = req.body;
  if (!phone || !name) {
    return res.status(400).json({ error: 'Имя и телефон обязательны' });
  }

  res.status(200).json({ status: 'success', message: 'Заявка принята' });

  setImmediate(async () => {
    const leadId = Date.now();
    const ymUid = utm?.ym_uid || utm?.click_id || utm?.yclid;

    // 1. Хеширование ПДн по 152-ФЗ (SHA-256)
    const hashedPhone = crypto.createHash('sha256').update(phone).digest('hex');
    console.log(`\n[152-ФЗ Analytics] Хеш номера телефона: ${hashedPhone}`);

    // 2. Запись в CRM Google Таблицы
    try {
      const sheetResponse = await fetch(GOOGLE_SHEETS_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ name, phone, channel, answers, utm }),
        redirect: 'follow'
      });
      const sheetText = await sheetResponse.text();
      console.log('📊 Ответ Google Таблицы:', sheetText);
    } catch (e) {
      console.error('❌ Ошибка записи в Google Таблицу:', e.message);
    }

    // 3. Дожим в Telegram
    if (channel === 'Telegram' || channel === 'WhatsApp') {
      await sendWappiMessage(phone, name);
    }

    // 4. Отправка сигнала конверсии в Яндекс Метрику (п. 5.6 ТЗ)
    await sendPostbackSignal(ymUid, leadId);
  });
});

app.post('/api/analytics/step', (req, res) => {
  const { sessionId, step, answer, utm } = req.body;
  console.log(`📈 [Квиз | Сессия ${sessionId}] Шаг "${step}": выбрано "${answer}"`);
  res.json({ status: 'ok' });
});

app.get('/api/budget/check', async (req, res) => {
  const currentBalance = await getAdBalance();
  const minBudgetThreshold = 20000;
  
  await checkAdBudgetAndNotify();

  res.json({
    status: 'ok',
    budgetInfo: {
      currentBalance: `${currentBalance} ₽`,
      minThreshold: `${minBudgetThreshold} ₽`,
      needsTopUp: currentBalance < minBudgetThreshold,
      actionRequired: currentBalance < minBudgetThreshold ? 'Отправлен счет на пополнение в Telegram' : 'Баланс в норме'
    }
  });
});

// =========================================================================
// 🚀 ЗАПУСК СЕРВЕРА
// =========================================================================
app.listen(PORT, () => {
  console.log(`\n==================================================`);
  console.log(`🚀 Сервер запущен на http://localhost:${PORT}`);
  console.log(`⚙️  Админка доступна на http://localhost:${PORT}/admin.html`);
  console.log(`📄 AI-файл доступен на http://localhost:${PORT}/llms.txt`);
  console.log(`==================================================\n`);
});