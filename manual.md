# mm-back-nest — Документація

## Зміст
1. [Налаштування Windows (перший запуск)](#налаштування-windows)
2. [Змінні оточення (.env)](#змінні-оточення)
3. [Таблиці БД](#таблиці-бд)
4. [Послідовність першого налаштування](#перше-налаштування)
5. [API Endpoints](#api-endpoints)
   - [Auth](#auth--apiauthstore)
   - [Setup (конфіг кіоску)](#setup--apisetup)
   - [Products](#products--apiproducts)
   - [Cart](#cart--apicart)
   - [Config](#config--apiconfig)
   - [Fiscal](#fiscal--apifiscal)
   - [Admin](#admin--apiadminstore)
   - [Sales](#sales--apisales)
   - [Finance](#finance--apifinance)
   - [Kiosk sync](#kiosk--apiadminkiosk)
   - [Screensaver](#screensaver--apiscreensaver)
   - [Static files](#static-files)
   - [WebSocket Events](#websocket-events)

---

## Налаштування Windows

### 1. MS SQL Server — Mixed Mode Authentication

1. Відкрити **SQL Server Management Studio (SSMS)**
2. Правий клік на сервері → **Properties** → **Security**
3. Вибрати **SQL Server and Windows Authentication mode** → OK
4. Перезапустити SQL Server: правий клік → **Restart**

---

### 2. Створення логіна mm_user

```sql
CREATE LOGIN mm_user WITH PASSWORD = 'mmNextRetail_TS-2026';
USE original;
CREATE USER mm_user FOR LOGIN mm_user;
ALTER ROLE db_owner ADD MEMBER mm_user;
```

> `db_owner` потрібний для `CREATE TABLE` при першому запуску міграцій.

---

### 3. Встановлення Docker Desktop

1. Завантажити **Docker Desktop for Windows**: https://www.docker.com/products/docker-desktop/
2. Встановити, перезавантажити ПК
3. Docker Desktop → **Settings** → увімкнути **Start Docker Desktop when you log in**

---

### 4. Клонування репозиторіїв

```bash
cd C:/git
git clone https://github.com/OlehBrov/mm-back-ts.git mm-back-nest
git clone https://github.com/OlehBrov/mm-front-ts.git mm-front-ts
git clone https://github.com/OlehBrov/mm-deploy.git mm-deploy
mkdir C:/git/mm-images
```

---

### 5. Перший запуск Docker

```bash
cd /c/git/mm-deploy
docker compose up --build -d
```

Перевірити статус:
```bash
docker compose ps
docker compose logs backend --tail=50
```

При успішному старті в логах будуть рядки:
```
LOG [Migrations] Applied: 001_add_fiscal_queue.sql
...
LOG [Application] Application running on port 6006
```

---

### 6. Пароль для фронтенду

Пароль задається в `docker-compose.yml` (`VITE_STORE_PASSWORD`). Хеш оновлюється через SSMS:

```bash
docker exec mm-deploy-backend-1 node -e \
  "const b=require('bcryptjs'); b.hash('ПАРОЛЬ',10).then(h=>console.log(h))"
```

```sql
UPDATE dbo.Store SET password = '$2b$10$...' WHERE auth_id = '998877';
```

---

### 7. Автозапуск Chrome (kiosk режим)

**Task Scheduler → Create Task:**
- **General:** `MM Kiosk` / ✅ Run with highest privileges
- **Triggers:** At log on → Delay: **1 minute**
- **Actions:** `powershell.exe` / `-ExecutionPolicy Bypass -WindowStyle Hidden -File "C:\git\mm-deploy\start-kiosk.ps1"`
- **Settings:** If already running → Do not start a new instance

Скрипт `start-kiosk.ps1` чекає на `http://localhost`, потім запускає Chrome у kiosk-режимі.

---

## Змінні оточення

Файл `.env` у корені `mm-back-nest`. При Docker-деплої — задаються в `docker-compose.yml`.

| Змінна | Обов'язкова | Опис |
|---|:---:|---|
| `DATABASE_URL` | ✅ | Connection string SQL Server |
| `STORE_AUTH_ID` | ✅ | `auth_id` рядка Store (напр. `998877`) |
| `AUTH_TOKEN_SECRET_KEY` | ✅ | Секрет для JWT access token |
| `REFRESH_TOKEN_SECRET_KEY` | ✅ | Секрет для JWT refresh token |
| `PORT` | — | HTTP порт (default: `6006`) |
| `MM_HOST` | — | Публічна адреса бекенду (default: `http://localhost:6006`), використовується для URL файлів |
| `TERMINAL_PROVIDER` | — | `privatbank` або `monobank` (default: `privatbank`). Перевизначається `active_bank` з БД |
| `CLIENT_HOST` | — | IP-адреса терміналу |
| `PRIVATBANK_PORT` | — | Порт PrivatBank (default: `2000`) |
| `MONOBANK_PORT` | — | Порт MonoBank (default: `3000`) |
| `TERMINAL_PAYMENT_TIMEOUT_MS` | — | Таймаут очікування відповіді терміналу на оплату в мс (default: `60000`) |
| `TERMINAL_CONNECTION_TIMEOUT_MS` | — | Таймаут перевірки з'єднання з терміналом в мс (default: `5000`) |
| `FISCAL_HOST` | — | Базова URL Вчасно.Каса (default: `https://kasa.vchasno.ua`) |
| `FISCAL_QUEUE_ALERT_THRESHOLD` | — | Кількість чеків у черзі, після якої надсилається email-сповіщення. `0` = вимкнено (default: `0`) |
| `OVERDUE_FISCALS_EMAIL` | — | Email для відправки звіту з протермінованими чеками щодня о 00:00 |
| `IMAGE_DIR` | — | Директорія зображень товарів (default: `C:/mm-images`) |
| `CATEGORY_IMAGE_DIR` | — | Директорія зображень категорій (default: `C:/mm-images/cat-images`) |
| `SCREENSAVER_DIR` | — | Директорія скрінсейверів (default: `C:/mm-images/screensavers`). Відео — в підпапці `/video` |
| `MAIL_HOST` | — | SMTP хост. Якщо не задано — email-сповіщення вимкнені |
| `MAIL_PORT` | — | SMTP порт (default: `587`) |
| `MAIL_SECURE` | — | `true` для SSL/TLS (default: `false`) |
| `MAIL_USER` | — | SMTP логін |
| `MAIL_PASS` | — | SMTP пароль |
| `MAIL_FROM` | — | Відправник (default: `MicroMarket <noreply@localhost>`) |
| `MAIL_TO` | — | Отримувач системних сповіщень (помилки фіскалізації) |

---

## Таблиці БД

### Store — конфіг кіоску

Один рядок = один кіоск. Заповнюється через API після першого запуску.

**Мінімальний рядок для запуску:**
```sql
INSERT INTO dbo.Store (auth_id, password, role, active_bank)
VALUES ('998877', '$2b$10$...', 'store', 'monobank');
```

**Всі поля:**

| Поле | Тип | Опис |
|---|---|---|
| `auth_id` | VARCHAR(50) | ✅ Унікальний ID магазину = `STORE_AUTH_ID` в `.env` |
| `password` | VARCHAR(200) | ✅ bcrypt-хеш пароля |
| `role` | VARCHAR(100) | ✅ Завжди `'store'` |
| `active_bank` | VARCHAR(20) | ✅ `'privatbank'` або `'monobank'` |
| `default_merchant` | VARCHAR(100) | ID мерчанта для оплат без ПДВ |
| `VAT_excise_merchant` | VARCHAR(100) | ID мерчанта для товарів з ПДВ/акцизом. `NULL` = один мерчант |
| `is_single_merchant` | BIT | `1` якщо один мерчант для всіх товарів |
| `use_VAT_by_default` | BIT | `1` — всі товари через VAT-мерчанта за замовчуванням |
| `default_merchant_taxgrp` | INT | Код податкової групи для товарів без ПДВ |
| `VAT_merchant_taxgrp` | INT | Код податкової групи для товарів з ПДВ 20% |
| `VAT_excise_taxgrp` | INT | Код податкової групи для товарів з ПДВ + акциз |
| `default_merchant_name` | NVARCHAR(100) | Назва мерчанта (для відображення) |
| `VAT_merchant_name` | NVARCHAR(100) | Назва VAT-мерчанта |
| `store_name` | VARCHAR(100) | Назва магазину |
| `store_address` | NVARCHAR(100) | Адреса магазину |
| `alert_email` | NVARCHAR(255) | Email для системних сповіщень (фіскальні помилки) |
| `support_email` | NVARCHAR(255) | Email служби підтримки (відображається у кіоску) |
| `feedback_email` | NVARCHAR(255) | Email для відправки звітів зворотного зв'язку |
| `last_feedback_report_date` | DATE | Дата останнього відправленого звіту feedback |
| `screensaver` | VARCHAR(255) | Ім'я активного файлу скрінсейвера (для режимів `static` і `video`) |
| `screensaver_mode` | VARCHAR(20) | Режим скрінсейвера: `'static'` / `'carousel'` / `'video'` / `NULL` |
| `screensaver_interval` | INT | Інтервал каруселі в секундах (default: `30`) |
| `store_sale_name` | NVARCHAR(100) | Назва поточної акції |
| `store_sale_title` | NVARCHAR(100) | Підзаголовок акції |
| `store_sale_discount` | DECIMAL(10,2) | Розмір знижки акції у % |
| `store_sale_product_category` | INT | cat_1C_id категорії для акції |
| `store_sale_product_subcategory` | INT | subcat_1C_id підкатегорії для акції |
| `screensaver` | VARCHAR(255) | Ім'я активного файлу скрінсейвера |
| `token` | VARCHAR(200) | Поточний JWT (керується автоматично) |

---

### FiscalConfig — токени Вчасно.Каса

Один рядок = один мерчант (RRO).

| Поле | Тип | Опис |
|---|---|---|
| `merchant_id` | VARCHAR(100) | ✅ Унікальний ID мерчанта (з терміналу) |
| `merchant_name` | NVARCHAR(255) | Назва ФОП / юрособи |
| `merchant_code` | VARCHAR(20) | ЄДРПОУ або ІПН |
| `fiscal_token` | NVARCHAR(255) | Токен каси Вчасно.Каса |
| `taxgrp` | INT | Код податкової групи (1–10) |

Заповнюється через `PUT /api/setup/fiscal/:merchantId`.

---

### TerminalConfig — конфіг POS-терміналів

Один рядок = один банк-провайдер.

| Поле | Тип | Опис |
|---|---|---|
| `bank` | NVARCHAR(20) | ✅ `'privatbank'` або `'monobank'` |
| `name` | NVARCHAR(100) | Назва терміналу (для відображення) |
| `host` | VARCHAR(100) | IP-адреса терміналу |
| `port` | INT | Порт терміналу (PrivatBank: 2000, MonoBank: 3000) |
| `terminal_id` | VARCHAR(50) | TID — ідентифікатор пристрою, присвоєний банком |

Заповнюється через `PUT /api/setup/terminal/:bank`.

---

### FiscalQueue — черга фіскальних чеків

| Поле | Тип | Опис |
|---|---|---|
| `id` | INT | PK |
| `payload` | NVARCHAR(MAX) | JSON чеку для відправки у Вчасно.Каса |
| `with_vat` | BIT | `1` = VAT-черга, `0` = стандартна |
| `bank` | VARCHAR(20) | Банк на момент оплати |
| `merchant_id` | VARCHAR(100) | ID мерчанта |
| `status` | VARCHAR(20) | `pending` / `processing` / `completed` / `failed` |
| `attempts` | INT | Кількість спроб відправки |
| `max_attempts` | INT | Максимум спроб (default: `10`) |
| `last_error` | NVARCHAR(500) | Остання помилка |
| `next_retry_at` | DATETIME | Час наступної спроби (exponential backoff) |
| `fiscal_response` | NVARCHAR(MAX) | Відповідь Вчасно.Каса при успіху |
| `created_at` | DATETIME | Час постановки в чергу |
| `processed_at` | DATETIME | Час успішної обробки |

Щодня о **00:00 (Київ)** незареєстровані чеки попереднього дня переносяться в `OverdueFiscalQueue` і надсилаються на `OVERDUE_FISCALS_EMAIL` у вигляді XLSX-звіту.

---

## Перше налаштування

1. **Вставити рядок Store** — `auth_id`, `password`, `role`, `active_bank`
2. **Запустити бекенд** — `docker compose up --build -d`
3. **Налаштувати кіоск одним запитом** — `POST /api/setup/kiosk-config`
4. **Або налаштувати покроково:**
   - `PUT /api/setup/terminal/:bank` — IP, порт, TID терміналу
   - `POST /api/setup/terminal/:bank/check` — перевірити з'єднання, отримати список мерчантів
   - `POST /api/setup/assign-merchants` — призначити мерчантів
   - `PUT /api/setup/fiscal/:merchantId` — токен Вчасно.Каса, taxgrp, ФОП
5. **Перевірити готовність** — `GET /api/setup/ready` (повертає `{ ready: true }` або список `missing`)
6. **Завантажити товари** — `POST /api/products/add`
7. **Завантажити категорії** — `POST /api/config/category` + `POST /api/config/subcategory`
8. *(Опційно)* **Скрінсейвер** — `POST /api/screensaver/upload` → `POST /api/screensaver/config`
9. *(Опційно)* **Акція** — `POST /api/config/store-sale`

---

## API Endpoints

Базовий URL: `http://localhost:6006/api`

Захищені ендпоінти (🔒) потребують заголовка:
```
Authorization: Bearer <token>
```

---

### Auth — `/api/auth/store`

#### `POST /api/auth/store/login`

**Body:**
```json
{ "login": "998877", "password": "mm_nextretail" }
```

**Response 200:**
```json
{
  "message": "success",
  "store_id": 11,
  "auth_id": "998877",
  "token": "<jwt>",
  "refreshToken": "<jwt>",
  "role": "store"
}
```

---

#### `POST /api/auth/store/refresh-token`

**Body:** `{ "refreshToken": "<jwt>" }`

**Response 200:** `{ "message": "Token refreshed", "token": "<jwt>" }`

---

#### `POST /api/auth/store/logout` 🔒

**Response 200:** `{ "message": "Logout success" }`

---

### Setup — `/api/setup`

Ендпоінти налаштування кіоску. Не потребують авторизації (доступні з локальної мережі).

---

#### `GET /api/setup/ready`
Перевірка готовності до роботи.

**Response 200:**
```json
{ "ready": true, "missing": [] }
```

або:
```json
{
  "ready": false,
  "missing": [
    "IP-адресу термінала monobank не вказано",
    "Токен Вчасно Каса для основного мерчанта відсутній"
  ]
}
```

---

#### `GET /api/setup`
Повний знімок конфігу: дані Store + всі TerminalConfig + всі FiscalConfig.

**Response 200:**
```json
{
  "store": {
    "store_name": "Кіоск #1",
    "store_address": "вул. Хрещатик, 1",
    "active_bank": "monobank",
    "alert_email": "alert@example.com",
    "support_email": "support@example.com",
    "feedback_email": "feedback@example.com",
    "default_merchant": "PQ0000000013166",
    "VAT_excise_merchant": null,
    "is_single_merchant": true
  },
  "terminalConfigs": [
    { "id": 1, "bank": "monobank", "name": "MonoBank PAX", "host": "192.168.0.185", "port": 3000, "terminal_id": "12345678" }
  ],
  "fiscalConfigs": [
    { "id": 1, "merchant_id": "PQ0000000013166", "merchant_name": "ФОП Іванов І.І.", "merchant_code": "1234567890", "fiscal_token": "q8FYOPDa...", "taxgrp": 1 }
  ]
}
```

---

#### `GET /api/setup/kiosk-config`
Структурований конфіг для кіоску — об'єднує Store, TerminalConfig і FiscalConfig.

**Response 200:**
```json
{
  "storeName": "Кіоск #1",
  "storeAddress": "вул. Хрещатик, 1",
  "bank": "monobank",
  "terminal": {
    "host": "192.168.0.185",
    "port": 3000,
    "terminalId": "12345678"
  },
  "fiscal": {
    "noVat": {
      "merchantId": "PQ0000000013166",
      "merchantName": "ФОП Іванов І.І.",
      "token": "q8FYOPDa...",
      "taxgrp": 1
    },
    "vat": null
  }
}
```

`fiscal.vat` — `null` якщо один мерчант.

---

#### `POST /api/setup/kiosk-config`
Зберегти повний конфіг кіоску одним запитом. Повертає актуальний стан (той самий формат, що GET).

**Body:**
```json
{
  "storeName": "Кіоск #1",
  "storeAddress": "вул. Хрещатик, 1",
  "bank": "monobank",
  "terminal": {
    "host": "192.168.0.185",
    "port": 3000,
    "terminalId": "12345678"
  },
  "fiscal": {
    "noVat": {
      "merchantId": "PQ0000000013166",
      "merchantName": "ФОП Іванов І.І.",
      "token": "q8FYOPDa...",
      "taxgrp": 1
    },
    "vat": {
      "merchantId": "PQ0000000013167",
      "merchantName": "ФОП Іванов І.І. (ПДВ)",
      "token": "5dq5ej0F...",
      "taxgrp": 2
    }
  }
}
```

| Поле | Обов'язкове | Опис |
|---|:---:|---|
| `bank` | ✅ | Банк-провайдер терміналу |
| `fiscal.noVat.merchantId` | ✅ | Мерчант без ПДВ |
| `fiscal.vat` | — | `null` або відсутній → `is_single_merchant = true` |
| `terminal` | — | Якщо не передано — TerminalConfig не оновлюється |
| `fiscal.noVat.token` | — | Токен Вчасно.Каса |
| `fiscal.noVat.taxgrp` | — | Код податкової групи (1–10) |
| `fiscal.noVat.merchantName` | — | Назва ФОП |

---

#### `PATCH /api/setup/store`
Оновити базові дані Store.

**Body:**
```json
{
  "store_name": "Кіоск #1",
  "store_address": "вул. Хрещатик, 1",
  "active_bank": "monobank",
  "alert_email": "alert@example.com",
  "support_email": "support@example.com",
  "feedback_email": "feedback@example.com"
}
```

---

#### `PUT /api/setup/terminal/:bank`
Зберегти або оновити конфіг терміналу для банку (`monobank` або `privatbank`).

**Body:**
```json
{
  "name": "MonoBank PAX A930",
  "host": "192.168.0.185",
  "port": 3000,
  "terminal_id": "12345678"
}
```

---

#### `POST /api/setup/terminal/:bank/check`
Перевірити з'єднання з терміналом і отримати список мерчантів.

**Response 200:**
```json
{
  "online": true,
  "merchants": [
    { "merchantId": "PQ0000000013166", "merchantName": "ФОП Іванов. Оплата" }
  ],
  "terminalConfig": { "host": "192.168.0.185", "port": 3000 }
}
```

> Мерчанти з назвою «Повернення» фільтруються автоматично.

---

#### `POST /api/setup/assign-merchants`
Призначити мерчантів ролям (без ПДВ / з ПДВ).

**Body:**
```json
{
  "default_merchant": "PQ0000000013166",
  "vat_merchant": "PQ0000000013167"
}
```

`vat_merchant` — необов'язковий. Якщо `null` / відсутній → `is_single_merchant = true`.

---

#### `PUT /api/setup/fiscal/:merchantId`
Зберегти конфіг Вчасно.Каса для мерчанта. Автоматично перевіряє токен.

**Body:**
```json
{
  "merchant_name": "ФОП Іванов І.І.",
  "merchant_code": "1234567890",
  "fiscal_token": "q8FYOPDa...",
  "taxgrp": 1
}
```

**Response 200:**
```json
{
  "config": { "merchant_id": "PQ...", "fiscal_token": "q8FY...", "taxgrp": 1, ... },
  "tokenStatus": { "valid": true, "fisid": "3000012345", "shift_status": 1, "online_status": 0, ... }
}
```

---

#### `POST /api/setup/fiscal/:merchantId/verify`
Перевірити поточний токен мерчанта через Вчасно API.

**Response 200:** `{ "valid": true, "fisid": "3000012345", ... }`

---

#### `DELETE /api/setup/fiscal/:merchantId`
Видалити конфіг фіскалізації для мерчанта.

**Response 200:** `{ "deleted": "PQ0000000013166" }`

---

### Products — `/api/products`

#### `GET /api/products` 🔒
Список товарів з фільтрацією.

**Query params:** `categoryId`, `subcategoryId`, `page`, `limit`

**Response 200:**
```json
{
  "data": [ { "id": 1, "product_name": "...", "barcode": "...", "product_price": 99.99 } ],
  "total": 150
}
```

---

#### `GET /api/products/search` 🔒
Пошук за назвою або штрих-кодом. **Query:** `searchQuery=<рядок>`

#### `GET /api/products/single` 🔒
Товар за штрих-кодом. **Query:** `barcode=1234567890`

#### `GET /api/products/product`
Товар за combo ID. **Query:** `comboId=5`

---

#### `POST /api/products/add`
Додати / оновити товари (масив). Використовується синхронізацією з 1С.

**Body:**
```json
[
  {
    "product_name": "Назва",
    "barcode": "1234567890",
    "measure": "шт",
    "product_code": "ABC001",
    "product_name_ua": "Назва UA",
    "product_price": 99.99,
    "product_left": 10,
    "product_category": 1,
    "product_subcategory": 2,
    "exposition_term": 0,
    "sale_id": 0,
    "is_VAT_Excise": false,
    "excise_product": false
  }
]
```

---

#### `POST /api/products/update`
Оновити поля товарів. Обов'язково: `barcode`.

#### `POST /api/products/withdraw`
Списати залишки. **Body:** `[{ "barcode": "...", "quantity": 2 }]`

#### `POST /api/products/image`
Зберегти зображення товарів (base64). **Body:** `[{ "productImage": "<base64>", "fileName": "..." }]`

---

### Cart — `/api/cart`

#### `POST /api/cart/sell` 🔒
Провести оплату через термінал + поставити чек у чергу фіскалізації.

**Body:**
```json
{
  "cartProducts": [
    {
      "id": 1,
      "barcode": "1234567890",
      "product_name": "Товар",
      "inCartQuantity": 2,
      "product_price": 99.99,
      "priceDecrement": 0,
      "is_VAT_Excise": false,
      "excise_product": false
    }
  ]
}
```

**Response 200:**
```json
{ "status": "success", "fiscalResponse": { "fiscalNoVAT": { ... }, "fiscalWithVAT": null } }
```

Можливі значення `status`: `success`, `part-success`, `cancelled`.

При `part-success` — перша оплата пройшла, друга скасована:
```json
{
  "status": "part-success",
  "fiscalResponse": { "fiscalNoVAT": { ... } },
  "error": { "target": "withVATProducts", "description": "Payment cancelled" }
}
```

---

#### `DELETE /api/cart/cancel` 🔒
Скасувати поточний платіж. **Response 200:** `{ "status": "cancelled" }`

---

### Config — `/api/config`

#### `GET /api/config/check-categories`
Список категорій з підкатегоріями.

#### `POST /api/config/category`
Додати категорії. **Body:** `[{ "category_name": "...", "cat_1C_id": 100, "category_discount": null }]`

#### `PATCH /api/config/category`
Оновити категорії. **Body:** `[{ "cat_1C_id": 100, "category_name": "...", "category_priority": 1 }]`

#### `POST /api/config/subcategory`
Додати підкатегорії. **Body:** `[{ "cat_1C_id": 100, "subcat_1C_id": 200, "subcategory_name": "..." }]`

#### `PATCH /api/config/subcategory`
Оновити підкатегорії.

#### `POST /api/config/move-subcategory`
Перемістити підкатегорію. **Body:** `[{ "cat_1C_id": 100, "subcat_1C_id": 200, "new_cat_1C_id": 150 }]`

#### `GET /api/config/store-sale`
Поточна акція магазину.

#### `POST /api/config/store-sale`
Встановити акцію.
```json
{
  "store_sale_product_category": 1,
  "store_sale_product_subcategory": 2,
  "store_sale_name": "Літній розпродаж",
  "store_sale_title": "Знижка 20%",
  "store_sale_discount": 20
}
```

#### `GET /api/config/merchant`
Зчитати мерчантів з терміналу та зберегти в БД.

#### `POST /api/config/merchant`
Встановити мерчантів.
```json
{
  "defaultMerchant": "PQ0000000013166",
  "vatExciseMerchant": null,
  "defaultMerchantTaxgrp": 1,
  "vatExciseMerchantTaxgrp": null,
  "isSingleMerchant": true,
  "useVATbyDefault": false
}
```

#### `POST /api/config/category-image`
Зберегти зображення категорій (base64).

---

### Fiscal — `/api/fiscal`

#### `GET /api/fiscal/queue/pending`
Кількість чеків у черзі (статус `pending` або `processing`).

**Response 200:** `5` (число)

---

#### `GET /api/fiscal/queue/failed`
Список чеків, що не пройшли після всіх спроб.

**Response 200:**
```json
[
  {
    "id": 42,
    "merchant_id": "PQ...",
    "with_vat": false,
    "attempts": 10,
    "last_error": "Fiscal API error: res=1, ...",
    "created_at": "2026-06-24T18:30:00.000Z"
  }
]
```

> Чеки зі статусом `failed` потребують ручного втручання: виправити проблему у кабінеті Вчасно.Каса, потім змінити `status = 'pending'` у таблиці `FiscalQueue` для повторної спроби.

---

### Логіка черги фіскалізації

- Чеки обробляються хронологічно (за `created_at`) **у межах кожного мерчанта окремо**.
- При помилці — exponential backoff: 10 с → 20 с → 40 с ... до 30 хв. Максимум 10 спроб.
- `res_action=3` від Вчасно = fatal error, повтор марний — надсилається email-сповіщення.
- Щодня **о 00:00 (Київ)** всі незареєстровані чеки попереднього дня переносяться в `OverdueFiscalQueue`, новий день починається з чистою чергою. На `OVERDUE_FISCALS_EMAIL` надсилається XLSX-звіт.
- Якщо кількість чеків у черзі перевищує `FISCAL_QUEUE_ALERT_THRESHOLD` — надсилається email-сповіщення (не частіше 1 разу на годину).

---

### Admin — `/api/admin/store`

| Метод | Шлях | Опис |
|---|---|---|
| `GET` | `/api/admin/store` | Список всіх магазинів |
| `GET` | `/api/admin/store/config` | Конфіг поточного магазину |
| `GET` | `/api/admin/store/products` | Всі товари |
| `POST` | `/api/admin/store/products` | Додати товари (спрощений формат) |
| `PATCH` | `/api/admin/store/products` | Масове оновлення товарів |
| `POST` | `/api/admin/store/create` | Створити новий магазин |
| `GET` | `/api/admin/store/withdraws` | Журнал списань |
| `POST` | `/api/admin/store` | Додати товари в магазин |

---

### Sales — `/api/sales`

| Метод | Шлях | Опис |
|---|---|---|
| `GET` | `/api/sales` | Список акцій |
| `POST` | `/api/sales/add` | Додати акцію |
| `POST` | `/api/sales/edit` | Редагувати акцію |
| `DELETE` | `/api/sales/delete` | Видалити акцію (`body: { sale_custom_id: 5 }`) |

---

### Finance — `/api/finance`

#### `POST /api/finance`

**Body:** `{ "start": "2026-01-01", "end": "2026-06-30", "type": 1 }`

`type`: `1` — покупки, `2` — повернення (опціонально).

---

### Kiosk — `/api/admin/kiosk`

#### `POST /api/admin/kiosk/sync`
Примусово запустити синхронізацію черги оновлень товарів.

**Response 200:** `{ "message": "Sync triggered", "errors": [] }`

---

### Screensaver — `/api/screensaver`

Скрінсейвер відображається коли кіоск переходить у режим очікування.  
Якщо режим не задано або файл відсутній — відображається стандартна CSS-заставка.

**Директорії:**
- Зображення: `SCREENSAVER_DIR` (default: `C:/mm-images/screensavers`)
- Відео: `SCREENSAVER_DIR/video` (default: `C:/mm-images/screensavers/video`)

**Підтримувані формати:**

| Тип | Розширення |
|---|---|
| Зображення | `.jpg`, `.jpeg`, `.png`, `.webp`, `.gif` |
| Відео | `.mp4`, `.webm`, `.mov` |

Максимальний розмір файлу: **200 MB**.

---

#### `GET /api/screensaver/config`
Отримати поточний конфіг скрінсейвера.

**Response 200:**
```json
{
  "mode": "carousel",
  "filename": null,
  "interval": 20,
  "file": null
}
```

| Поле | Тип | Опис |
|---|---|---|
| `mode` | `'static'` \| `'carousel'` \| `'video'` \| `null` | `null` → CSS-заставка за замовчуванням |
| `filename` | string \| null | Ім'я файлу (для `static` і `video`). `null` для `carousel` |
| `interval` | number | Інтервал каруселі в секундах (завжди присутній, default: `30`) |
| `file` | object \| null | Розгорнута інформація про файл або `null` для `carousel` |

`file` (якщо не `null`):
```json
{ "filename": "promo.jpg", "type": "image", "url": "http://localhost:6006/api/screensaver-file/promo.jpg" }
```

---

#### `POST /api/screensaver/config`
Зберегти конфіг скрінсейвера. Повертає актуальний конфіг (той самий формат, що GET).

**Режим `static` — один файл-зображення:**
```json
{ "mode": "static", "filename": "promo.jpg" }
```

**Режим `carousel` — всі зображення по черзі:**
```json
{ "mode": "carousel", "interval": 20 }
```
`interval` — в секундах, від 5 до 3600. Default: `30`.

**Режим `video`:**
```json
{ "mode": "video", "filename": "ad.mp4" }
```

| Поле | Обов'язкове | Опис |
|---|:---:|---|
| `mode` | ✅ | `'static'`, `'carousel'` або `'video'` |
| `filename` | ✅ для `static`/`video` | Ім'я файлу (має існувати на диску) |
| `interval` | — | Інтервал каруселі (лише для `carousel`) |

---

#### `DELETE /api/screensaver/config`
Скинути конфіг — повертає до CSS-заставки за замовчуванням.

**Response 200:** `{ "cleared": true }`

---

#### `GET /api/screensaver/files`
Всі файли скрінсейвера (зображення + відео).

**Response 200:**
```json
{
  "files": [
    { "filename": "promo.jpg", "type": "image", "url": "http://localhost:6006/api/screensaver-file/promo.jpg" },
    { "filename": "ad.mp4",   "type": "video", "url": "http://localhost:6006/api/screensaver-file/ad.mp4" }
  ]
}
```

#### `GET /api/screensaver/images`
Тільки зображення (з `SCREENSAVER_DIR`).

#### `GET /api/screensaver/videos`
Тільки відео (з `SCREENSAVER_DIR/video`).

---

#### `POST /api/screensaver/upload`
Завантажити файл. Тип визначається автоматично за розширенням — відео зберігаються в підпапку `/video`.

```bash
curl -X POST http://localhost:6006/api/screensaver/upload -F "file=@/path/to/promo.jpg"
```

PowerShell:
```powershell
$form = @{ file = Get-Item 'C:\path\to\ad.mp4' }
Invoke-RestMethod -Uri 'http://localhost:6006/api/screensaver/upload' -Method Post -Form $form
```

**Response 200:** `{ "filename": "ad.mp4", "size": 15728640 }`

---

#### `DELETE /api/screensaver/file/:filename`
Видалити файл. Якщо файл був активним — конфіг скрінсейвера скидається.

**Response 200:** `{ "deleted": "promo.jpg" }`

---

#### `GET /api/screensaver-file/:filename`
Роздача файлу скрінсейвера. Підтримує `Range`-запити (відео без повного завантаження).

Приклад: `http://localhost:6006/api/screensaver-file/ad.mp4`

---

### Static files

| Метод | Шлях | Опис |
|---|---|---|
| `GET` | `/api/product-image/:filename` | Зображення товару |
| `GET` | `/api/category-image/:filename` | Зображення категорії |
| `GET` | `/api/reciept-proxy/:id` | Фіскальний чек з vchasno.kasa |

---

### WebSocket Events

Підключення: `ws://localhost:6006` (або через nginx proxy на порту 80).

**Сервер → клієнт:**

| Подія | Дані | Опис |
|---|---|---|
| `terminal-status` | `{ status: 'online' \| 'offline' }` | Зміна статусу терміналу |
| `secondPayment` | — | Початок другого платежу (2 мерчанти) |
| `product-updated` | — | Зміна в асортименті (тригер для refresh) |
| `screen-status` | — | Запит кіоску: чи в idle? Відповідь клієнта → `idle-status` |

**Клієнт → сервер:**

| Подія | Дані | Опис |
|---|---|---|
| `idle-status` | `{ isIdleOpen: true \| false }` | Перехід в / вихід з idle-режиму |
| `admin-ping` | — | Перевірка з'єднання. Відповідь: `admin-pong` |
