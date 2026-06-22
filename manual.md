# mm-back-nest — Документація

## Зміст
1. [Налаштування Windows (перший запуск)](#налаштування-windows)
2. [Початкові налаштування БД (таблиця Store)](#початкові-налаштування-бд)
3. [API Endpoints](#api-endpoints)
4. [Налаштування фіскальних токенів](#фіскальні-токени)
5. [Скрінсейвер](#скрінсейвер)

---

## Налаштування Windows

### 1. MS SQL Server — Mixed Mode Authentication

Після встановлення SQL Server потрібно увімкнути змішану автентифікацію (SQL + Windows), якщо вона не увімкнена:

1. Відкрити **SQL Server Management Studio (SSMS)**
2. Підключитися як Windows Administrator
3. Правий клік на сервері → **Properties** → **Security**
4. Вибрати **SQL Server and Windows Authentication mode**
5. Натиснути OK
6. Перезапустити SQL Server:
   ```
   Правий клік на сервері → Restart
   ```

---

### 2. Створення логіна mm_user

Виконати в SSMS (підключившись як sa або Windows Admin):

```sql
-- Створити логін
CREATE LOGIN mm_user WITH PASSWORD = 'mmNextRetail_TS-2026';

-- Переключитися на базу original
USE original;

-- Створити користувача в базі
CREATE USER mm_user FOR LOGIN mm_user;

-- Надати повні права на базу
ALTER ROLE db_owner ADD MEMBER mm_user;
```

> `db_owner` потрібний для CREATE TABLE при першому запуску міграцій.
> Після першого запуску можна понизити до `db_datareader` + `db_datawriter` + `db_ddladmin`.

---

### 3. Встановлення Docker Desktop

1. Завантажити **Docker Desktop for Windows**: https://www.docker.com/products/docker-desktop/
2. Встановити, перезавантажити ПК
3. Відкрити Docker Desktop → **Settings** → увімкнути **Start Docker Desktop when you log in**

---

### 4. Клонування репозиторіїв

Відкрити Git Bash або PowerShell:

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

При успішному старті в логах бекенду будуть рядки:
```
LOG [Migrations] Applied: 001_add_fiscal_queue.sql
LOG [Migrations] Applied: 002_add_active_bank.sql
...
LOG [NestFactory] Starting Nest application...
LOG [Application] Application running on port 6006
```

---

### 6. Налаштування пароля для фронтенду

Пароль для автологіна фронту встановлюється в `docker-compose.yml` (поле `VITE_STORE_PASSWORD`).
Відповідний хеш у БД оновлюється вручну через SSMS:

```bash
# Згенерувати bcrypt-хеш нового пароля
docker exec mm-deploy-backend-1 node -e "const b=require('bcryptjs'); b.hash('НОВИЙ_ПАРОЛЬ',10).then(h=>console.log(h))"
```

```sql
-- Оновити хеш в БД
UPDATE dbo.Store
SET password = '$2b$10$...(хеш з попередньої команди)...'
WHERE auth_id = '998877';
```

---

### 7. Автозапуск Chrome (kiosk режим)

Налаштувати **Task Scheduler**:

- `Win+R` → `taskschd.msc` → **Create Task**
- **General**: Name: `MM Kiosk` / ✅ Run with highest privileges
- **Triggers**: At log on → Delay task for: **1 minute**
- **Actions**: Start a program
  - Program: `powershell.exe`
  - Arguments: `-ExecutionPolicy Bypass -WindowStyle Hidden -File "C:\git\mm-deploy\start-kiosk.ps1"`
- **Settings**: If already running → Do not start a new instance

Скрипт `start-kiosk.ps1` чекає поки фронт стане доступним на `http://localhost`, після чого запускає Chrome у кіоск-режимі.

---

## Початкові налаштування БД

Всі налаштування кіоску зберігаються в таблиці `dbo.Store`. Один рядок = один кіоск.  
`auth_id` має збігатися зі значенням `STORE_AUTH_ID` у `.env`.

### Мінімальний рядок для запуску

```sql
INSERT INTO dbo.Store (auth_id, password, role, active_bank)
VALUES (
  '998877',                          -- має збігатись з STORE_AUTH_ID у .env
  '$2b$10$...',                      -- bcrypt-хеш пароля (генерується окремо, див. нижче)
  'store',
  'privatbank'                       -- або 'monobank'
);
```

> Решта полів заповнюється через API після першого запуску.

---

### Всі поля таблиці Store

| Поле | Тип | Обов'язкове | Опис | Як заповнити |
|---|---|:---:|---|---|
| `auth_id` | VARCHAR(50) | ✅ | Унікальний ідентифікатор магазину. Збігається з `STORE_AUTH_ID` в `.env` | Вручну при створенні |
| `password` | VARCHAR(200) | ✅ | bcrypt-хеш пароля для логіну фронтенду | Вручну (генерація нижче) |
| `role` | VARCHAR(100) | ✅ | Роль — завжди `'store'` | Вручну при створенні |
| `active_bank` | VARCHAR(20) | ✅ | Банк-провайдер терміналу: `'privatbank'` або `'monobank'` | Вручну або через API |
| `default_merchant` | VARCHAR(100) | ✅¹ | ID мерчанта для оплат без ПДВ | `GET /api/config/merchant` |
| `default_merchant_taxgrp` | INT | ✅¹ | Податкова група для товарів без ПДВ (напр. `7` — не є об'єктом ПДВ) | `POST /api/config/merchant` |
| `is_single_merchant` | BIT | ✅¹ | `1` якщо один мерчант для всіх товарів | `GET /api/config/merchant` |
| `fiscal_token` | NVARCHAR(255) | ✅² | Токен каси Вчасно.Каса (без ПДВ) | `POST /api/fiscal/tokens` |
| `VAT_excise_merchant` | VARCHAR(100) | — | ID мерчанта для товарів з ПДВ/акцизом. `NULL` якщо один мерчант | `GET /api/config/merchant` |
| `VAT_merchant_taxgrp` | INT | — | Податкова група для товарів з ПДВ 20% | `POST /api/config/merchant` |
| `VAT_excise_taxgrp` | INT | — | Податкова група для товарів з ПДВ+акциз | `POST /api/config/merchant` |
| `fiscal_token_vat` | NVARCHAR(255) | — | Токен другої каси Вчасно.Каса (з ПДВ). `NULL` якщо один РРО | `POST /api/fiscal/tokens` |
| `use_VAT_by_default` | BIT | — | `1` — всі товари йдуть через VAT-мерчанта за замовчуванням | `POST /api/config/merchant` |
| `store_name` | VARCHAR(100) | — | Назва магазину | Вручну або через Admin API |
| `store_address` | NVARCHAR(100) | — | Адреса магазину | Вручну або через Admin API |
| `store_sale_name` | NVARCHAR(100) | — | Назва поточної акції на слайдері | `POST /api/config/store-sale` |
| `store_sale_title` | NVARCHAR(100) | — | Підзаголовок акції | `POST /api/config/store-sale` |
| `store_sale_discount` | DECIMAL(10,2) | — | Розмір знижки акції у % | `POST /api/config/store-sale` |
| `store_sale_product_category` | INT | — | cat_1C_id категорії для акції | `POST /api/config/store-sale` |
| `store_sale_product_subcategory` | INT | — | subcat_1C_id підкатегорії для акції | `POST /api/config/store-sale` |
| `screensaver` | VARCHAR(255) | — | Ім'я активного файлу скрінсейвера | `PUT /api/screensaver/active` |
| `token` | VARCHAR(200) | — | Поточний JWT access token (керується автоматично при login/logout) | Автоматично |
| `default_merchant_name` | NVARCHAR(100) | — | Назва мерчанта (для відображення) | `GET /api/config/merchant` |
| `VAT_merchant_name` | NVARCHAR(100) | — | Назва VAT-мерчанта | `GET /api/config/merchant` |

> ¹ Обов'язкове для проведення оплати (`POST /api/cart/sell`).  
> ² Обов'язкове для фіскалізації чеків. Якщо не задано — fallback на `AUTH_MERCH_TOKEN` з `.env`.

---

### Генерація bcrypt-хешу пароля

```bash
docker exec mm-deploy-backend-1 node -e \
  "const b=require('bcryptjs'); b.hash('ВАШ_ПАРОЛЬ',10).then(h=>console.log(h))"
```

Або локально (якщо встановлено Node.js):
```bash
node -e "const b=require('bcryptjs'); b.hash('ВАШ_ПАРОЛЬ',10).then(h=>console.log(h))"
```

Отриманий хеш вставити в поле `password`:
```sql
UPDATE dbo.Store SET password = '$2b$10$...' WHERE auth_id = '998877';
```

---

### Послідовність першого налаштування

1. **Вставити рядок Store** — `auth_id`, `password`, `role`, `active_bank`
2. **Запустити бекенд** — `docker compose up -d`
3. **Синхронізувати мерчантів** — `GET /api/config/merchant`  
   Заповнює `default_merchant`, `VAT_excise_merchant`, `is_single_merchant`
4. **Встановити податкові групи** — `POST /api/config/merchant`  
   Задати `defaultMerchantTaxgrp` (і `vatExciseMerchantTaxgrp` якщо є VAT)
5. **Додати токен Вчасно.Каса** — `POST /api/fiscal/tokens`  
   Заповнює `fiscal_token` (і `fiscal_token_vat` якщо є другий РРО)
6. **Завантажити товари** — через 1С-синхронізацію або `POST /api/products/add`
7. **Завантажити категорії** — `POST /api/config/category` + `POST /api/config/subcategory`
8. *(Опційно)* **Скрінсейвер** — `POST /api/screensaver/upload` → `PUT /api/screensaver/active`
9. *(Опційно)* **Акція** — `POST /api/config/store-sale`

---

## API Endpoints

Базовий URL: `http://localhost:6006/api`

Всі захищені ендпоінти потребують заголовка:
```
Authorization: Bearer <token>
```

---

### Auth — `/api/auth/store`

#### `POST /api/auth/store/login`
Авторизація магазину.

**Body:**
```json
{
  "login": "998877",
  "password": "mm_nextretail"
}
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
Оновлення access token.

**Body:**
```json
{ "refreshToken": "<jwt>" }
```

**Response 200:**
```json
{ "message": "Token refreshed", "token": "<jwt>" }
```

---

#### `POST /api/auth/store/logout` 🔒
Вихід (очищає token в БД).

**Response 200:**
```json
{ "message": "Logout success" }
```

---

### Products — `/api/products`

#### `GET /api/products` 🔒
Список товарів магазину з фільтрацією.

**Query params:**
| Параметр | Тип | Опис |
|---|---|---|
| `categoryId` | number | ID категорії |
| `subcategoryId` | number | ID підкатегорії |
| `page` | number | Сторінка (default: 1) |
| `limit` | number | Кількість на сторінці |

**Response 200:**
```json
{
  "data": [ { "id": 1, "product_name": "...", "barcode": "...", "product_price": 99.99, ... } ],
  "total": 150,
  "status": "ok"
}
```

---

#### `GET /api/products/search` 🔒
Пошук товарів за назвою або штрих-кодом.

**Query params:**
| Параметр | Тип | Опис |
|---|---|---|
| `searchQuery` | string | Рядок пошуку |

---

#### `GET /api/products/single` 🔒
Отримати товар за штрих-кодом.

**Query params:** `barcode=1234567890`

---

#### `GET /api/products/product`
Отримати товар за combo ID.

**Query params:** `comboId=5`

---

#### `POST /api/products/add`
Додати товари (масив). Використовується синхронізацією з 1С.

**Body:** масив об'єктів:
```json
[
  {
    "product_name": "Назва",
    "barcode": "1234567890",
    "measure": "шт",
    "product_code": "ABC001",
    "product_name_ua": "Назва UA",
    "product_name_ru": "Название",
    "product_price": 99.99,
    "product_left": 10,
    "product_category": 1,
    "product_subcategory": 2,
    "exposition_term": 0,
    "sale_id": 0,
    "is_VAT_Excise": false,
    "excise_product": false,
    "is_new_product": false
  }
]
```

**Response 200:**
```json
{ "message": "Products added", "count": 5 }
```

---

#### `POST /api/products/update`
Оновити поля товарів (масив). Тільки передані поля змінюються.

**Body:** масив об'єктів (обов'язково `barcode`, решта — опціонально):
```json
[
  {
    "barcode": "1234567890",
    "product_price": 109.99,
    "product_left": 8
  }
]
```

---

#### `POST /api/products/withdraw`
Списати залишки товарів.

**Body:**
```json
[
  { "barcode": "1234567890", "quantity": 2 }
]
```

---

#### `POST /api/products/inventarization`
Обнулити залишки всіх товарів (підготовка до інвентаризації).

**Response 200:**
```json
{ "message": "Inventarization complete" }
```

---

#### `POST /api/products/image`
Зберегти зображення товарів (base64).

**Body:**
```json
[
  {
    "productImage": "<base64-рядок>",
    "fileName": "1234567890.jpg"
  }
]
```

Файли зберігаються в `IMAGE_DIR` (`/app/images` в Docker → `C:/git/mm-images` на диску).

---

### Cart — `/api/cart`

#### `POST /api/cart/sell` 🔒
Провести оплату кошика через термінал + фіскалізація.

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

**Response 200 — успіх:**
```json
{
  "status": "success",
  "fiscalResponse": {
    "fiscalNoVAT": { ... },
    "fiscalWithVAT": { ... }
  }
}
```

**Response 200 — частковий успіх (2 мерчанти, перший пройшов, другий скасовано):**
```json
{
  "status": "part-success",
  "fiscalResponse": { "fiscalNoVAT": { ... } },
  "error": { "target": "withVATProducts", "description": "Payment cancelled" }
}
```

**Response 200 — скасовано:**
```json
{ "status": "cancelled" }
```

---

#### `DELETE /api/cart/cancel` 🔒
Скасувати поточний платіж (перериває транзакцію на терміналі).

**Response 200:**
```json
{ "status": "cancelled" }
```

---

### Config — `/api/config`

#### `GET /api/config/check-categories`
Отримати список категорій і підкатегорій.

**Response 200:**
```json
{
  "categories": [ { "id": 1, "category_name": "...", "cat_1C_id": 100, "subcategories": [...] } ]
}
```

---

#### `POST /api/config/category`
Додати категорії.

**Body:**
```json
[
  { "category_name": "Напої", "cat_1C_id": 100, "category_discount": null, "category_image": null }
]
```

---

#### `PATCH /api/config/category`
Оновити категорії.

**Body:**
```json
[
  { "cat_1C_id": 100, "category_name": "Нова назва", "category_priority": 1 }
]
```

---

#### `POST /api/config/subcategory`
Додати підкатегорії.

**Body:**
```json
[
  { "cat_1C_id": 100, "subcat_1C_id": 200, "subcategory_name": "Соки", "subcategory_discount": null }
]
```

---

#### `PATCH /api/config/subcategory`
Оновити підкатегорії.

**Body:**
```json
[
  { "cat_1C_id": 100, "subcat_1C_id": 200, "subcategory_name": "Нова назва" }
]
```

---

#### `POST /api/config/move-subcategory`
Перемістити підкатегорію в іншу категорію (асинхронно, через чергу).

**Body:**
```json
[
  { "cat_1C_id": 100, "subcat_1C_id": 200, "new_cat_1C_id": 150, "subcat_name": "Соки" }
]
```

---

#### `GET /api/config/store-sale`
Отримати поточну акцію магазину.

---

#### `POST /api/config/store-sale`
Встановити акцію магазину.

**Body:**
```json
{
  "store_sale_product_category": 1,
  "store_sale_product_subcategory": 2,
  "store_sale_name": "Літній розпродаж",
  "store_sale_title": "Знижка 20%",
  "store_sale_discount": 20
}
```

---

#### `GET /api/config/merchant`
Зчитати список мерчантів з терміналу, зберегти в БД і повернути поточні налаштування.

> При одному мерчанті (немає окремого VAT) `vatExciseMerchant` буде `null`, `isSingleMerchant` = `true`.

**Response 200:**
```json
{
  "status": "success",
  "defaultMerchant": "1",
  "vatExciseMerchant": null,
  "useVATbyDefault": false,
  "isSingleMerchant": true,
  "noVATTaxGroup": 7,
  "VATTaxGroup": 1,
  "VATExciseTaxGroup": 3
}
```

---

#### `GET /api/config/terminal-merchants`
Отримати сирий список мерчантів безпосередньо з терміналу (без запису в БД).

**Response 200:**
```json
{
  "merchants": [
    { "merchantId": "1", "merchantName": "ФОП Іваненко. Оплата" }
  ]
}
```

> Мерчанти з назвою «Повернення» фільтруються автоматично — вони не є окремими мерчантами, а функцією повернення.

---

#### `POST /api/config/merchant`
Встановити мерчантів терміналу.

**Body:**
```json
{
  "defaultMerchant": "PQ0000000013166",
  "vatExciseMerchant": "PQ0000000013167",
  "useVATbyDefault": false,
  "isSingleMerchant": true,
  "defaultMerchantTaxgrp": 1,
  "vatExciseMerchantTaxgrp": 2
}
```

---

#### `POST /api/config/category-image`
Зберегти зображення категорій (base64).

**Body:**
```json
[
  {
    "categoryImage": "<base64-рядок>",
    "fileName": "category_100.jpg",
    "categoryId": 100
  }
]
```

Файли зберігаються в `CATEGORY_IMAGE_DIR` (`/app/images/cat-images` → `C:/git/mm-images/cat-images`).

---

### Static files

#### `GET /api/product-image/:filename`
Отримати зображення товару.

Приклад: `GET /api/product-image/1234567890.jpg`

---

#### `GET /api/category-image/:filename`
Отримати зображення категорії.

Приклад: `GET /api/category-image/category_100.jpg`

---

#### `GET /api/reciept-proxy/:id`
Отримати фіскальний чек з vchasno.kasa за ID.

**Response 200:**
```json
{ "data": { ... }, "message": "Tax reciept" }
```

---

### Admin — `/api/admin/store`

#### `GET /api/admin/store`
Список всіх магазинів.

#### `GET /api/admin/store/config`
Конфігурація поточного магазину (з env `STORE_AUTH_ID`).

#### `GET /api/admin/store/products`
Всі товари (без прив'язки до магазину).

#### `POST /api/admin/store/products`
Додати товари напряму (спрощений формат, без обов'язкових полів синхронізації).

**Body:**
```json
[
  { "product_name": "Назва", "barcode": "123", "price": 50, "total": 10, "image": "filename.jpg" }
]
```

#### `PATCH /api/admin/store/products`
Масове оновлення товарів (довільні поля).

#### `POST /api/admin/store/create`
Створити новий магазин.

**Body:**
```json
{ "name": "Магазин 1", "location": "Київ", "auth_id": "111111", "password": "secret" }
```

#### `GET /api/admin/store/withdraws`
Журнал списань.

#### `POST /api/admin/store`
Додати товари в магазин.

**Body:**
```json
{
  "store_id": 11,
  "productsToAdd": [ { "product_id": 1, "quantity": 100, "discount": 0 } ]
}
```

---

### Sales — `/api/sales`

#### `GET /api/sales` — список акцій
#### `POST /api/sales/add` — додати акцію
#### `POST /api/sales/edit` — редагувати акцію
#### `DELETE /api/sales/delete` — видалити акцію (`body: { sale_custom_id: 5 }`)

---

### Finance — `/api/finance`

#### `POST /api/finance`
Отримати операції терміналу за період.

**Body:**
```json
{ "start": "2026-01-01", "end": "2026-06-30", "type": 1 }
```

`type`: `1` — покупки, `2` — повернення (опціонально).

---

### Kiosk — `/api/admin/kiosk`

#### `POST /api/admin/kiosk/sync`
Примусово запустити синхронізацію черги оновлень товарів (без очікування idle-стану кіоску).

**Response 200:**
```json
{ "message": "Sync triggered", "errors": [] }
```

---

### Fiscal — `/api/fiscal`

#### `GET /api/fiscal/tokens`
Повернути поточні токени Вчасно.Каса (з БД або env-fallback) та перевірити їх статус через API Вчасно (task 18 — «Статус пРРО»).

**Response 200:**
```json
{
  "token": "q8FYOPDa...",
  "tokenVat": "5dq5ej0F...",
  "tokenStatus": {
    "valid": true,
    "res": 0,
    "errortxt": "",
    "fisid": "3000012345",
    "isFis": 1,
    "shift_status": 1,
    "online_status": 0
  },
  "tokenVatStatus": {
    "valid": true,
    "res": 0,
    "errortxt": "",
    "fisid": "3000012346",
    "isFis": 1,
    "shift_status": 0,
    "online_status": 0
  }
}
```

| Поле `tokenStatus` | Значення |
|---|---|
| `valid` | `true` — токен прийнятий Вчасно |
| `isFis` | `1` — фіскальна каса, `0` — тестова |
| `shift_status` | `0` — зміну закрито, `1` — відкрито, `2` — заблоковано |
| `online_status` | `0` — online, `1` — offline, `2` — заблоковано |

> Якщо `tokenVat` не заданий або збігається з `token`, `tokenVatStatus` буде `null`.

---

#### `POST /api/fiscal/tokens`
Зберегти токени в БД і одразу перевірити їх.

**Body:**
```json
{
  "token": "q8FYOPDa...",
  "tokenVat": "5dq5ej0F..."
}
```

> `tokenVat` — необов'язкове. Якщо магазин має один РРО (без ПДВ), передавати не потрібно.

**Response 200:** аналогічна структура до `GET /api/fiscal/tokens` (без полів `token`/`tokenVat`, тільки статуси перевірки).

> Після збереження токен-кеш скидається, всі наступні фіскальні запити використовуватимуть нові токени.

---

### WebSocket Events

Підключення: `ws://localhost:6006` (або через nginx proxy на порту 80).

| Подія (сервер → клієнт) | Опис |
|---|---|
| `terminal-status` | Статус терміналу: `{ status: 'online' \| 'offline' }` |
| `secondPayment` | Сигнал початку другого платежу (2 мерчанти) |
| `fiscal-update` | Оновлення статусу фіскалізації |

| Подія (клієнт → сервер) | Опис |
|---|---|
| `idle-status` | Кіоск переходить в idle: `true \| false` |

---

## Фіскальні токени

Токени Вчасно.Каса зберігаються в таблиці `Store` (колонки `fiscal_token`, `fiscal_token_vat`).  
При першому запуску, якщо токени в БД відсутні, використовуються значення `AUTH_MERCH_TOKEN` та `AUTH_MERCH_TOKEN_VAT` з `.env` як fallback.

### Як додати / оновити токени

1. Відкрити кабінет [kasa.vchasno.ua](https://kasa.vchasno.ua) → **Налаштування** → конкретна каса → **Налаштувати касу**
2. Скопіювати токен каси
3. Надіслати POST-запит:

```bash
curl -X POST http://localhost:6006/api/fiscal/tokens \
  -H "Content-Type: application/json" \
  -d '{"token": "ВАШТОКЕН"}'
```

Або через PowerShell:
```powershell
Invoke-RestMethod -Uri 'http://localhost:6006/api/fiscal/tokens' `
  -Method Post -ContentType 'application/json' `
  -Body '{"token":"ВАШТОКЕН"}'
```

У відповіді буде `tokenStatus.valid: true` якщо токен прийнятий Вчасно.

### Перевірка поточних токенів

```bash
curl http://localhost:6006/api/fiscal/tokens
```

### Два мерчанти (з ПДВ і без)

Якщо у магазину два РРО (один для звичайних товарів, інший для товарів з ПДВ/акцизом):

```json
{
  "token": "ТОКЕН_БЕЗ_ПДВ",
  "tokenVat": "ТОКЕН_З_ПДВ"
}
```

Система автоматично використовує потрібний токен залежно від групи товарів у чеку.

### На старті застосунку

При кожному запуску бекенд автоматично перевіряє обидва токени через Вчасно API (task 18 — «Статус пРРО»).  
Результат виводиться в лог:
```
LOG [FiscalService] Fiscal token check: valid=true, fisid=3000012345, isFis=1, shift=1, online=0
```

---

## Скрінсейвер

Скрінсейвер відображається на екрані кіоску коли кіоск переходить у режим очікування.  
Підтримуються зображення (JPG, PNG, WEBP, GIF) та відео (MP4, WEBM, MOV).  
Максимальний розмір файлу: **200 MB**.

Файли зберігаються в директорії `SCREENSAVER_DIR` (`.env`), за замовчуванням `C:/mm-images/screensavers`.

### Кроки для встановлення скрінсейвера

#### 1. Завантажити файл

```bash
curl -X POST http://localhost:6006/api/screensaver/upload \
  -F "file=@/path/to/video.mp4"
```

PowerShell:
```powershell
$form = @{ file = Get-Item 'C:\path\to\video.mp4' }
Invoke-RestMethod -Uri 'http://localhost:6006/api/screensaver/upload' -Method Post -Form $form
```

**Response 200:**
```json
{ "filename": "video.mp4", "size": 15728640 }
```

#### 2. Переглянути завантажені файли

```bash
curl http://localhost:6006/api/screensaver/files
```

**Response 200:**
```json
{
  "files": [
    { "filename": "promo.jpg",  "type": "image", "url": "http://localhost:6006/api/screensaver-file/promo.jpg" },
    { "filename": "video.mp4",  "type": "video", "url": "http://localhost:6006/api/screensaver-file/video.mp4" }
  ]
}
```

#### 3. Активувати скрінсейвер

```bash
curl -X PUT http://localhost:6006/api/screensaver/active \
  -H "Content-Type: application/json" \
  -d '{"filename": "video.mp4"}'
```

PowerShell:
```powershell
Invoke-RestMethod -Uri 'http://localhost:6006/api/screensaver/active' `
  -Method Put -ContentType 'application/json' `
  -Body '{"filename":"video.mp4"}'
```

**Response 200:**
```json
{ "filename": "video.mp4" }
```

Кіоск підхопить новий скрінсейвер при наступному переході в idle — перезапуск не потрібен.

#### 4. Деактивувати скрінсейвер

```bash
curl -X PUT http://localhost:6006/api/screensaver/active \
  -H "Content-Type: application/json" \
  -d '{"filename": null}'
```

#### 5. Видалити файл

```bash
curl -X DELETE http://localhost:6006/api/screensaver/video.mp4
```

> Якщо видалений файл був активним — скрінсейвер автоматично деактивується.

### Отримати активний скрінсейвер

```bash
curl http://localhost:6006/api/screensaver/active
```

**Response 200 (активний):**
```json
{ "filename": "video.mp4", "type": "video", "url": "http://localhost:6006/api/screensaver-file/video.mp4" }
```

**Response 200 (не встановлено):**
```json
{ "filename": null, "type": null, "url": null }
```

### Перегляд файлу напряму

```
GET /api/screensaver-file/:filename
```

Приклад: `http://localhost:6006/api/screensaver-file/video.mp4`

Підтримує `Range`-запити (відео відтворюється в браузері без повного завантаження).

### Підтримувані формати

| Тип | Формати |
|---|---|
| Зображення | `.jpg`, `.jpeg`, `.png`, `.webp`, `.gif` |
| Відео | `.mp4`, `.webm`, `.mov` |

> Відео відтворюється автоматично (autoplay, loop, без звуку). Рекомендований формат — **MP4 (H.264)** для максимальної сумісності.
