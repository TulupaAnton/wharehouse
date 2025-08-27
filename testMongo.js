require('dotenv').config({ path: './config/.env' })
console.log('DEBUG:', process.env.MONGO_URI)
const mongoose = require('mongoose')

async function testConnection () {
  try {
    await mongoose.connect(process.env.MONGO_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true
    })
    console.log('✅ Подключение к MongoDB успешно!')

    // Проверим список баз
    const admin = mongoose.connection.db.admin()
    const info = await admin.listDatabases()
    console.log(
      '📂 Список баз:',
      info.databases.map(db => db.name)
    )

    await mongoose.disconnect()
  } catch (err) {
    console.error('❌ Ошибка подключения:', err.message)
  }
}

testConnection()
