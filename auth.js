const { TelegramClient } = require('telegram');
const { StringSession } = require('telegram/sessions');
const input = require('input');

const apiId = 21724;
const apiHash = '3e0da5ee600b0c3f551352926451e041';

const stringSession = new StringSession('');

(async () => {
  console.log('=== Авторизация Telegram аккаунта ===');
  const client = new TelegramClient(stringSession, apiId, apiHash, {
    connectionRetries: 5,
  });

  await client.start({
    phoneNumber: async () => await input.text('Введите ваш номер телефона (+7...): '),
    password: async () => await input.text('2FA пароль (если включен, иначе Enter): '),
    phoneCode: async () => await input.text('Введите код подтверждения из Telegram: '),
    onError: (err) => console.log(err),
  });

  console.log('\n✅ Авторизация прошла успешно!');
  console.log('👇 СКОПИРУЙ ТЕКСТ НИЖЕ (СТРОКА СЕССИИ):');
  console.log(client.session.save());
})();