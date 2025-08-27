const mongoose = require('mongoose')

const productSchema = new mongoose.Schema(
  {
    warehouse: { type: String, required: true },
    product: { type: String, required: true }, // как ввёл пользователь
    productKey: { type: String, required: true }, // нормализованное имя (lowercase)
    quantity: { type: Number, required: true, default: 0 }
  },
  { timestamps: true }
)

// Один товар на складе в единственном экземпляре (уникальность)
productSchema.index({ warehouse: 1, productKey: 1 }, { unique: true })

module.exports = mongoose.model('Product', productSchema)
