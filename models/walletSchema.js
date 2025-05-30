const mongoose = require('mongoose');
const {Schema} = mongoose

const walletSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    balance: {
        type: Number,
        required: true
    },
    transaction: [{
        amount: {
            type: Number,
            required: false
        },
        transactionsMethod: {
            type: String,
            required: false,
            enum: ["Credit", "Razorpay", "referral", "Refund", "Payment"]
        },
        date: {
            type: Date,
            default: Date.now
        },
        orderId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Orders',
            required: false
        },
        description: { 
            type: String, 
            required: false 
        }
    }]
}, { timestamps: true });


const Wallet = mongoose.model("Wallet",walletSchema);


module.exports = Wallet;