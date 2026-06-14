# mm-back-nest — Документація

## Зміст
1. [Налаштування Windows (перший запуск)](#налаштування-windows)
2. [API Endpoints](#api-endpoints)

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
Отримати налаштування мерчантів терміналу.

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
