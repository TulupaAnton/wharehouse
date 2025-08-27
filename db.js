const sqlite3 = require('sqlite3').verbose()

// Создаем базу данных (если нет, создается файл warehouse.db)
const db = new sqlite3.Database('./warehouse.db')

// Создаем таблицу для склада
db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS inventory (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      warehouse TEXT,
      product TEXT,
      quantity INTEGER
    )
  `)
})

module.exports = db
