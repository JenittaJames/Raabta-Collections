const mongoose = require('mongoose');
const {Schema} = mongoose

const couponSchema = new mongoose.Schema({
    couponCode: {
        type: String,
        required: true,
        uppercase: true
    },
    type: {
        type: String,
        enum: ['percentageDiscount', 'flatDiscount'],
        required: true
    },
    minimumPrice: {
        type: Number,
        required: true
    },
    discount: {
        type: Number,
        min: 0,
        required: true,
        validate: {
            validator: function (value) {
                if (value <= 0) {
                    return false;
                }
                if (this.type === 'percentageDiscount') {
                    return value <= 100;
                }
                return true;
            },
            message: props => {
                if (props.value <= 0) {
                    return `Discount must be a positive number.`;
                }
                if (this.type === 'percentageDiscount' && props.value > 100) {
                    return `Percentage discount cannot exceed 100%.`;
                }
                return `${props.value} is not a valid discount for the selected type!`;
            }
        }
    },
    maxRedeem: {
        type: Number,
        required: true
    },
    expiry: {
        type: Date,
        required: true
    },
    status: {
        type: Boolean,
        required: true,
        default: true
    },
    description: {
        type: String,
        default: "",
      },
    usedBy: [{
        userId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User'
        },
        usedAt: {
            type: Date,
            default: Date.now
        },
        orderId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Order",
          },
    }]
},{ timestamps : true })

couponSchema.index({ expiry: 1 }, { expireAfterSeconds: 0 })

const Coupon = mongoose.model("Coupon",couponSchema);


module.exports = Coupon;