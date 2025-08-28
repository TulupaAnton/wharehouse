require('dotenv').config({ path: './config/.env' })
const { Telegraf, Markup } = require('telegraf')
const mongoose = require('mongoose')
const LocalSession = require('telegraf-session-local')
const Product = require('./models/Product')

const bot = new Telegraf(process.env.BOT_TOKEN)

// Сессии для UI-состояний
const localSession = new LocalSession({ database: 'session_db.json' })
bot.use(localSession.middleware())

// Подключение к MongoDB
mongoose
  .connect(process.env.MONGO_URI)
  .then(() => console.log('✅ MongoDB подключена'))
  .catch(err => console.log('Ошибка подключения MongoDB:', err))

// Склады (обновленные названия)
const warehouses = [
  '🏠 Серий гараж',
  '🌿 Зелений гараж',
  '📦 Катлаван',
  '🏡 Дом'
]

// Эмодзи для разных действий
const emojis = {
  add: '📥',
  check: '🔍',
  list: '📋',
  remove: '📤',
  success: '✅',
  error: '❌',
  info: 'ℹ️',
  warehouse: '🏭'
}

// Хелперы
const normalizeName = s => s.trim().replace(/\s+/g, ' ').toLowerCase()

// Функция для создания ключа поиска (первое слово без символов)
const createSearchKey = name => {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^\w\sа-яё]/gi, '') // удаляем все символы кроме букв, цифр и пробелов
    .split(/\s+/)[0] // берем первое слово
}

function parseAddLine (text) {
  // Пробуем разные форматы
  const formats = [
    // Формат: "Помидор - 1000" или "Помидор-1000"
    text.match(/^(.+?)\s*-\s*(\d+)\s*шт?\.?$/i),
    // Формат: "Помидор 1000"
    text.match(/^(.+?)\s+(\d+)\s*шт?\.?$/i),
    // Формат: "Помидор 1000" (просто число в конце)
    (() => {
      const parts = text.trim().split(/\s+/)
      if (parts.length < 2) return null
      const qty = parseInt(parts[parts.length - 1], 10)
      if (isNaN(qty)) return null
      const name = parts.slice(0, -1).join(' ')
      return [null, name, qty]
    })()
  ]

  // Находим первый подходящий формат
  for (const match of formats) {
    if (match && match[1] && match[2]) {
      const name = match[1].trim()
      const qty = parseInt(match[2], 10)
      if (!isNaN(qty)) {
        return { name, qty }
      }
    }
  }

  return null
}

function formatList (products) {
  if (!products.length) return '📭 На складе пока пусто.'
  return products.map(p => `• ${p.product} — ${p.quantity} шт.`).join('\n')
}

function formatWarehouseName (warehouse) {
  return warehouse.replace(/^(🏠|🌿|📦|🏡)\s*/, '')
}

// Функция для поиска товара по части названия
async function findProductByPartialName (warehouse, searchName) {
  const searchKey = createSearchKey(searchName)
  const allProducts = await Product.find({ warehouse }).sort({ product: 1 })

  // Ищем товары, которые содержат поисковый ключ
  const matchedProducts = allProducts.filter(product => {
    const productKey = createSearchKey(product.product)
    return productKey.includes(searchKey) || searchKey.includes(productKey)
  })

  return matchedProducts.length > 0 ? matchedProducts[0] : null
}

// Стилизованные сообщения
const messages = {
  welcome: `🎯 *Добро пожаловать в систему управления складами!*

    Выберите действие:`,

  addProduct: warehouse =>
    `📥 *Добавление товара на склад:* ${warehouse}\n\nОтправьте товар и количество:\n*Пример:* "Молоко 10" или "Молоко - 10"`,

  checkProduct: warehouse =>
    `🔍 *Проверка товара на складе:* ${warehouse}\n\nОтправьте название товара для проверки:`,

  removeProduct: (warehouse, products) => {
    const productList = formatList(products)
    return `📤 *Списание товара со склада:* ${warehouse}\n\n📊 *Текущие остатки:*\n${productList}\n\nОтправьте товар и количество для списания:\n*Пример:* "Молоко 3" или "Молоко - 3"`
  },

  productUpdated: (product, warehouse, quantity) =>
    `✅ *Обновлено!*\nТовар: ${product}\nСклад: ${warehouse}\nТекущее количество: *${quantity} шт.*`,

  productChecked: (product, warehouse, quantity) =>
    `🔍 *Информация о товаре:*\nТовар: ${product}\nСклад: ${warehouse}\nКоличество: *${quantity} шт.*`,

  productNotFound: (product, warehouse) =>
    `❌ Товар "*${product}*" не найден на складе ${warehouse}`,

  productNotFoundRemove: (product, warehouse, similarProducts = []) => {
    let message = `❌ *Товар не найден!*\nТовар "*${product}*" отсутствует на складе ${warehouse}\n\n`

    if (similarProducts.length > 0) {
      message += `Возможно вы имели в виду:\n${similarProducts
        .map(p => `• ${p.product}`)
        .join('\n')}\n\n`
    }

    message += `Проверьте правильность названия или выберите другой товар.`
    return message
  },

  removedPartial: (product, warehouse, removed, remaining) =>
    `📤 *Списание выполнено!*\nТовар: ${product}\nСклад: ${warehouse}\nСписано: ${removed} шт.\nОстаток: *${remaining} шт.*`,

  removedComplete: (product, warehouse) =>
    `✅ *Товар полностью списан!*\nТовар: ${product}\nСклад: ${warehouse}\nТовар удален со склада.`,

  currentStock: (product, quantity) =>
    `📦 *Текущий остаток:* ${product} — *${quantity} шт.*`,

  removingAmount: qty => `\nСписание ${qty} шт...`,

  emptyWarehouse: warehouse =>
    `📤 *Списание товара со склада:* ${warehouse}\n\n📭 *На складе пока нет товаров!*\n\nСначала добавьте товары на склад.`
}

// /start
bot.start(ctx => {
  ctx.session.state = null
  ctx.replyWithMarkdown(
    messages.welcome,
    Markup.keyboard([
      ['📥 Добавить товар', '🔍 Проверить товар'],
      ['📋 Показать остатки', '📤 Списать товар']
    ]).resize()
  )
})

// Главное меню
bot.hears('📥 Добавить товар', ctx => {
  ctx.session.state = 'adding_warehouse'
  ctx.replyWithMarkdown(
    '🏭 *Выберите склад для добавления:*',
    Markup.inlineKeyboard(
      warehouses.map(w => [Markup.button.callback(w, `add_${w}`)])
    )
  )
})

bot.hears('🔍 Проверить товар', ctx => {
  ctx.session.state = 'checking_warehouse'
  ctx.replyWithMarkdown(
    '🏭 *Выберите склад для проверки:*',
    Markup.inlineKeyboard(
      warehouses.map(w => [Markup.button.callback(w, `check_${w}`)])
    )
  )
})

bot.hears('📋 Показать остатки', ctx => {
  ctx.session.state = 'list_warehouse'
  ctx.replyWithMarkdown(
    '🏭 *Выберите склад для просмотра остатков:*',
    Markup.inlineKeyboard(
      warehouses.map(w => [Markup.button.callback(w, `list_${w}`)])
    )
  )
})

bot.hears('📤 Списать товар', ctx => {
  ctx.session.state = 'remove_warehouse'
  ctx.replyWithMarkdown(
    '🏭 *Выберите склад для списания:*',
    Markup.inlineKeyboard(
      warehouses.map(w => [Markup.button.callback(w, `remove_${w}`)])
    )
  )
})

// Выбор склада для добавления
bot.action(/add_(.+)/, async ctx => {
  await ctx.answerCbQuery().catch(() => {})
  ctx.session.warehouse = ctx.match[1]
  ctx.session.state = 'adding_product'
  ctx.replyWithMarkdown(messages.addProduct(ctx.session.warehouse))
})

// Выбор склада для проверки
bot.action(/check_(.+)/, async ctx => {
  await ctx.answerCbQuery().catch(() => {})
  ctx.session.warehouse = ctx.match[1]
  ctx.session.state = 'checking_product'
  ctx.replyWithMarkdown(messages.checkProduct(ctx.session.warehouse))
})

// Показ остатков по складу
bot.action(/list_(.+)/, async ctx => {
  await ctx.answerCbQuery().catch(() => {})
  const warehouse = ctx.match[1]
  const products = await Product.find({ warehouse }).sort({ product: 1 })

  const text = `📊 *Остатки на складе ${warehouse}:*\n\n` + formatList(products)
  ctx.replyWithMarkdown(text)
  ctx.session.state = null
})

// Выбор склада для списания
bot.action(/remove_(.+)/, async ctx => {
  await ctx.answerCbQuery().catch(() => {})
  const warehouse = ctx.match[1]
  ctx.session.warehouse = warehouse
  ctx.session.state = 'removing_product'

  // Получаем текущие остатки на складе
  const products = await Product.find({ warehouse }).sort({ product: 1 })

  if (products.length === 0) {
    ctx.replyWithMarkdown(messages.emptyWarehouse(warehouse))
  } else {
    ctx.replyWithMarkdown(messages.removeProduct(warehouse, products))
  }
})

// Обработка текстов по состояниям
bot.on('text', async ctx => {
  const state = ctx.session.state
  const warehouse = ctx.session.warehouse

  // === ДОБАВЛЕНИЕ ТОВАРА ===
  if (state === 'adding_product') {
    const parsed = parseAddLine(ctx.message.text)
    if (!parsed)
      return ctx.replyWithMarkdown(
        '❌ *Неверный формат!*\nИспользуйте: *<Название> <Количество>*\n*Пример:* "Молоко 10" или "Молоко - 10"'
      )

    const { name, qty } = parsed
    const productKey = normalizeName(name)

    await Product.updateOne(
      { warehouse, productKey },
      {
        $setOnInsert: { warehouse, product: name, productKey },
        $inc: { quantity: qty }
      },
      { upsert: true }
    )

    const updated = await Product.findOne({ warehouse, productKey })
    ctx.replyWithMarkdown(
      messages.productUpdated(name, warehouse, updated.quantity)
    )
    ctx.session.state = null
    return
  }

  // === ПРОВЕРКА ТОВАРА ===
  if (state === 'checking_product') {
    const name = ctx.message.text.trim()
    const productKey = normalizeName(name)
    const product = await Product.findOne({ warehouse, productKey })

    if (!product) {
      // Пробуем найти по частичному совпадению
      const foundProduct = await findProductByPartialName(warehouse, name)
      if (foundProduct) {
        ctx.replyWithMarkdown(
          messages.productChecked(
            foundProduct.product,
            warehouse,
            foundProduct.quantity
          )
        )
      } else {
        ctx.replyWithMarkdown(messages.productNotFound(name, warehouse))
      }
    } else {
      ctx.replyWithMarkdown(
        messages.productChecked(product.product, warehouse, product.quantity)
      )
    }

    ctx.session.state = null
    return
  }

  // === СПИСАНИЕ ТОВАРА ===
  if (state === 'removing_product') {
    const parsed = parseAddLine(ctx.message.text)
    if (!parsed)
      return ctx.replyWithMarkdown(
        '❌ *Неверный формат!*\nИспользуйте: *<Название> <Количество>*\n*Пример:* "Молоко 3" или "Молоко - 3"'
      )

    const { name, qty } = parsed
    let product = await Product.findOne({
      warehouse,
      productKey: normalizeName(name)
    })

    // Если не нашли по полному совпадению, ищем по частичному
    if (!product) {
      product = await findProductByPartialName(warehouse, name)
    }

    if (!product) {
      // Показываем похожие товары
      const allProducts = await Product.find({ warehouse }).sort({ product: 1 })
      const similarProducts = allProducts.filter(
        p =>
          createSearchKey(p.product).includes(createSearchKey(name)) ||
          createSearchKey(name).includes(createSearchKey(p.product))
      )

      ctx.replyWithMarkdown(
        messages.productNotFoundRemove(name, warehouse, similarProducts)
      )
    } else {
      // Показываем текущее количество перед списанием
      await ctx.replyWithMarkdown(
        messages.currentStock(product.product, product.quantity) +
          messages.removingAmount(qty)
      )

      if (qty > product.quantity) {
        // Если пытаются списать больше чем есть
        ctx.replyWithMarkdown(
          `❌ *Недостаточно товара!*\nТовар: ${product.product}\nНа складе: *${product.quantity} шт.*\nПытаетесь списать: *${qty} шт.*\n\nСписание невозможно.`
        )
      } else if (qty === product.quantity) {
        // Полное списание
        await Product.deleteOne({ _id: product._id })
        ctx.replyWithMarkdown(
          messages.removedComplete(product.product, warehouse)
        )
      } else {
        // Частичное списание
        product.quantity -= qty
        await product.save()
        ctx.replyWithMarkdown(
          messages.removedPartial(
            product.product,
            warehouse,
            qty,
            product.quantity
          )
        )
      }
    }

    ctx.session.state = null
    return
  }

  // Если пользователь пишет вне контекста
  if (!state) {
    ctx.replyWithMarkdown(
      '🎯 *Выберите действие на клавиатуре:*\n\n📥 Добавить товар\n🔍 Проверить товар\n📋 Показать остатки\n📤 Списать товар'
    )
  }
})

// Запуск бота
bot.launch().then(() => console.log('✅ Бот запущен с MongoDB!'))

process.once('SIGINT', () => bot.stop('SIGINT'))
process.once('SIGTERM', () => bot.stop('SIGTERM'))
