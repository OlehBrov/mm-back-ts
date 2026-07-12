# API Endpoints — mm-back-nest

Глобальний префікс: **`/api`** (див. `main.ts`). 🔒 = потребує `StoreAuthGuard` (Bearer JWT store-токена в заголовку `Authorization`).

---

## 1. Auth — `/api/auth/store`

| Метод | Шлях | Параметри | Призначення |
|---|---|---|---|
| POST | `/login` | Body: `login` (обов.), `password` (обов.) | Логін магазину, повертає access+refresh токени |
| POST | `/refresh-token` | Body: `refreshToken` (обов.) | Оновлення access-токена |
| POST 🔒 | `/logout` | — | Логаут поточного магазину (store з JWT) |

---

## 2. Cart — `/api/cart` 🔒 (весь контролер під `StoreAuthGuard`)

| Метод | Шлях | Параметри | Призначення |
|---|---|---|---|
| POST | `/sell` | Body: `cartProducts[]` (обов., масив), кожен елемент: `id`, `barcode`, `product_name`, `inCartQuantity`, `product_price`, `priceDecrement` (обов.); `product_code`, `mark`, `product_lot`, `sale_id`, `merchant`, `is_VAT_Excise`, `excise_product` (необов.) | Продаж кошика: оплата на терміналі, розбиття по tax group (noVAT/VAT), фіскалізація, списання залишків |
| DELETE | `/cancel` | — | Скасування поточної оплати на терміналі |

---

## 3. Products (Store) — `/api/products`

| Метод | Шлях | Auth | Параметри | Призначення |
|---|---|---|---|---|
| GET | `/` | 🔒 | Query: `filter`, `subcategory`, `division` (всі необов.) | Список товарів магазину з фільтрами |
| GET | `/search` | 🔒 | Query: `searchQuery` (обов.) | Пошук товарів |
| GET | `/product` | — | Query: `comboId` (обов., number) | Отримати товар за comboId (для комбо-продуктів) |
| GET | `/single` | 🔒 | Query: `barcode` (обов.) | Отримати один товар за штрихкодом |
| POST | `/add` | — | Body: масив об'єктів. Обов.: `product_name`, `barcode`, `measure`, `product_code`, `product_name_ua`, `product_left`, `product_price`, `exposition_term`, `sale_id`, `product_category`, `product_subcategory`. Необов.: `product_name_ru`, `product_description`, `product_image`, `is_VAT_Excise`, `excise_product`, `combo_id`, `child_product_barcode` (обов. лише якщо `sale_id === 7`), `is_new_product`, `product_division` | Додавання нових товарів (валідація полів → категорій → конфліктів БД → чергу ProductUpdateQueue) |
| POST | `/withdraw` | — | Body: масив. Обов.: `barcode`, `quantity`. Необов.: `limit` | Списання товару зі складу |
| POST | `/inventarization` | — | — | Масове списання при інвентаризації |
| POST | `/image` | — | Body: масив. Обов.: `productImage` (base64), `fileName` | Збереження зображень товарів |
| POST | `/update` | — | Body: масив. Обов.: `barcode`. Необов. (усі решта): `product_name`, `product_code`, `measure`, `product_name_ru/ua`, `product_description`, `product_image`, `product_price`, `product_discount`, `exposition_term`, `sale_id`, `discount_price_1/2/3`, `combo_id`, `product_category`, `product_subcategory`, `is_VAT_Excise`, `excise_product`, `is_new_product`, `product_division` | Оновлення полів товару (тільки передані поля) |

---

## 4. Config — `/api/config`

| Метод | Шлях | Параметри | Призначення |
|---|---|---|---|
| GET | `/check-categories` | — | Перевірка узгодженості категорій/підкатегорій |
| POST | `/category` | Body: масив. Обов.: `category_name`, `cat_1C_id`. Необов.: `category_discount`, `category_image` | Додавання категорій (з перевіркою дублікатів cat_1C_id) |
| PATCH | `/category` | Body: масив. Обов.: `cat_1C_id`. Необов.: `category_name`, `category_discount`, `category_image`, `category_priority` | Редагування категорії |
| POST | `/subcategory` | Body: масив. Обов.: `cat_1C_id`, `subcat_1C_id`, `subcategory_name`. Необов.: `subcategory_discount` | Додавання підкатегорій |
| PATCH | `/subcategory` | Body: масив. Обов.: `cat_1C_id`, `subcat_1C_id`. Необов.: `subcategory_name`, `subcategory_discount`, `new_subcat_1C_id`, `new_cat_1C_id` | Редагування підкатегорії |
| POST | `/move-subcategory` | Body: масив. Обов.: `cat_1C_id`, `subcat_1C_id`, `new_cat_1C_id`. Необов.: `subcat_name` | Переміщення підкатегорії в іншу категорію (через чергу) |
| POST | `/store-sale` | Body, обов. усі: `store_sale_product_category`, `store_sale_product_subcategory`, `store_sale_name`, `store_sale_title`, `store_sale_discount` | Додавання знижки для категорії/підкатегорії |
| GET | `/store-sale` | — | Список знижок магазину |
| GET | `/merchant` | — | Дані мерчантів (fiscal config) |
| GET | `/terminal-merchants` | — | Список мерчантів, отриманих з терміналу |
| POST | `/merchant` | Body, обов.: `defaultMerchant`, `vatExciseMerchant`, `useVATbyDefault`, `isSingleMerchant`. Необов.: `defaultMerchantTaxgrp`, `vatExciseMerchantTaxgrp` | Встановлення мерчантів магазину |
| POST | `/category-image` | Body: масив, обов.: `categoryImage` (base64), `fileName`, `categoryId` | Збереження зображень категорій |

---

## 5. Setup — `/api/setup` (адмін-панель першого налаштування кіоску)

| Метод | Шлях | Параметри | Призначення |
|---|---|---|---|
| GET | `/ready` | — | Швидка перевірка готовності (`{ ready, missing[] }`), викликається кіоском при старті |
| POST | `/service-auth` | Body: `password` (обов.) | Перевірка пароля сервісного техніка |
| GET | `/` | — | Повний знімок конфігурації: store info + всі terminal configs + всі fiscal configs |
| GET | `/kiosk-config` | — | Структурований конфіг: store info, активний термінал (host/port/terminalId), fiscal-токени й tax groups |
| POST | `/kiosk-config` | Body: `bank` (обов.), `fiscal.noVat` (обов., вкладений об'єкт з `merchantId` обов.), `fiscal.vat` (необов.), `terminal` (необов., вкладений: `host`,`port`,`terminalId`), `storeName`, `storeAddress` (необов.) | Встановлення повного конфігу кіоску за один запит |
| PATCH | `/store` | Body, усе необов.: `store_name`, `store_address`, `active_bank`, `alert_email`, `support_email`, `feedback_email` | Оновлення базової інформації магазину |
| PUT | `/terminal/:bank` | Param: `bank` (обов., `monobank`\|`privatbank`). Body, усе необов.: `name`, `host`, `port`, `terminal_id` | Upsert конфігу терміналу для банку |
| POST | `/terminal/:bank/check` | Param: `bank` (обов.) | Перевірка доступності терміналу + список мерчантів (тільки якщо `bank` збігається з активним) |
| POST | `/assign-merchants` | Body: `default_merchant` (обов.), `vat_merchant` (необов.) | Призначення мерчантів на ролі noVAT/VAT + створення FiscalConfig-заглушок |
| PUT | `/fiscal/:merchantId` | Param: `merchantId` (обов.). Body, усе необов.: `merchant_name`, `merchant_code`, `fiscal_token`, `taxgrp` (1-10) | Upsert fiscal-конфігу мерчанта |
| POST | `/fiscal/:merchantId/verify` | Param: `merchantId` (обов.) | Перевірка токена мерчанта через vchasno API |
| DELETE | `/fiscal/:merchantId` | Param: `merchantId` (обов.) | Видалення fiscal-конфігу мерчанта |

---

## 6. Admin — Store — `/api/admin/store`

| Метод | Шлях | Параметри | Призначення |
|---|---|---|---|
| GET | `/` | — | Список усіх магазинів |
| GET | `/config` | — | Конфіг поточного магазину (за `authId` з ConfigService) |
| GET | `/withdraws` | — | Список списань |
| POST | `/` | Body: `store_id` (обов.), `productsToAdd[]` (обов.: `product_id`, `quantity`; необов.: `discount`) | Додавання товарів у магазин |
| POST | `/create` | Body, усе обов.: `name`, `location`, `auth_id`, `password` | Створення нового магазину |
| GET | `/products` | — | Список усіх товарів (адмін) |
| POST | `/products` | Body: масив, обов.: `product_name`, `barcode`, `price`, `total`. Необов.: `image`, `description`, `category[]` | Додавання товарів (адмін-версія) |
| PATCH | `/products` | Body: масив, обов.: `product_id`, решта полів довільні/необов. | Оновлення товарів (адмін-версія) |

## Admin — Sales — `/api/sales`

| Метод | Шлях | Параметри | Призначення |
|---|---|---|---|
| GET | `/` | — | Список акцій/знижок |
| POST | `/add` | Body, обов.: `sale_name`, `sale_custom_id`. Необов.: `sale_discount_1/2/3`, `sale_description` | Додавання знижки |
| POST | `/edit` | Body, обов.: `sale_custom_id`, решта довільні необов. поля | Редагування знижки |
| DELETE | `/delete` | Body: `sale_custom_id` (обов.) | Видалення знижки |

## Admin — Finance — `/api/finance`

| Метод | Шлях | Параметри | Призначення |
|---|---|---|---|
| POST | `/` | Body, обов.: `start`, `end` (дати). Необов.: `type` | Звіт по платежах за період |

---

## 7. Feedback — `/api/feedback`

| Метод | Шлях | Параметри | Призначення |
|---|---|---|---|
| POST | `/` | Body: `rating` (обов., ціле 1–5) | Збереження відгуку користувача (Feedbacks) |

---

## 8. Fiscal — `/api/fiscal`

| Метод | Шлях | Параметри | Призначення |
|---|---|---|---|
| GET | `/queue/pending` | — | Кількість чеків у черзі на фіскалізацію |
| GET | `/queue/failed` | — | Список зафейлених фіскальних задач |

---

## 9. Kiosk — `/api/admin/kiosk`

| Метод | Шлях | Параметри | Призначення |
|---|---|---|---|
| POST | `/sync` | — | Ручний запуск синхронізації черг (ProductUpdateQueue/SubcategoryMoveQueue) з БД |

---

## 10. Screensaver — `/api/screensaver`

| Метод | Шлях | Параметри | Призначення |
|---|---|---|---|
| GET | `/files` | — | Всі файли скрінсейвера (зображення + відео) |
| GET | `/images` | — | Тільки зображення |
| GET | `/videos` | — | Тільки відео |
| GET | `/config` | — | Поточний конфіг скрінсейвера (`mode: static\|carousel\|video\|null`) |
| POST | `/config` | Body: `mode` (обов., одне з `static`/`carousel`/`video`). `filename` — обов. для `static`/`video`, ігнорується для `carousel`. `interval` (необов., 5–3600с, дефолт 30) — тільки для `carousel` | Збереження конфігу скрінсейвера |
| DELETE | `/config` | — | Скидання конфігу до дефолтного CSS-скрінсейвера |
| DELETE | `/file/:filename` | Param: `filename` (обов.) | Видалення файлу скрінсейвера |
| POST | `/upload` | multipart/form-data, поле `file` (обов., ≤200MB, дозволені img/video розширення) | Завантаження нового файлу скрінсейвера |

---

## 11. Статика / проксі

| Метод | Шлях | Параметри | Призначення |
|---|---|---|---|
| GET | `/api/product-image/:filename` | Param: `filename` | Роздача зображення товару з `IMAGE_DIR` |
| GET | `/api/category-image/:filename` | Param: `filename` | Роздача зображення категорії з `CATEGORY_IMAGE_DIR` |
| GET | `/api/screensaver-file/:filename` | Param: `filename` | Роздача файлу скрінсейвера (авто-визначення img/video директорії) |
| GET | `/api/reciept-proxy/:id` | Param: `id` (обов.) | Проксі до фіскального чека на vchasno (`kasa.vchasno.ua/c/:id.json`) |

---

**Примітка щодо авторизації:** `StoreAuthGuard` (JWT, виданий у `/auth/store/login`) застосований лише до `POST /cart/sell`, `DELETE /cart/cancel`, `POST /auth/store/logout` та трьох ендпоінтів `GET /products` (`/`, `/search`, `/single`). Решта (config, setup, admin, feedback, fiscal, screensaver, static) — без гварда, розраховані на довірений internal/admin доступ.
