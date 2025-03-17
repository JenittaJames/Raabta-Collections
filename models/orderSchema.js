const mongoose = require('mongoose');
const { Schema } = mongoose;

const orderSchema = new Schema({
    userId: {
        type: mongoose.Schema.ObjectId,
        ref: "User",
    },
    cartId: {
        type: mongoose.Schema.ObjectId,
        ref: "Cart"
    },
    deliveryAddress: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Address",
        required: true
    },
    orderNumber: {
        type: String,
        required: true,
        unique: true
    },
    orderedItem: [{
        productId: {
            type: mongoose.Schema.ObjectId,
            ref: "Product",
        },
        quantity: {
            type: Number,
            required: true,
        },
        productPrice: {
            type: Number,
            required: true,
        },
        productStatus: {
            type: String,
            enum: ["Pending", "Shipped", "Delivered", "Cancelled", "Returned", "Return Requested", "Return Approved", "Return Rejected"],
            default: "Pending",
            required: true
        },
        totalProductPrice: {
            type: Number,
            required: true
        },
        refunded: {
            type: Boolean,
            default: false
        },
        returnReason: {
            type: String,
        },
        returnRequestDate: Date,
        returnApproved: {
            type: Boolean,
            default: false
        },
        returnApprovedDate: Date,
        returnNotes: String
    }],
    orderAmount: {
        type: Number,
        required: true
    },
    discountAmount: { // Added for coupon discount
        type: Number,
        default: 0
    },
    finalAmount: { // Added for final amount after discount
        type: Number,
        required: true
    },
    couponApplied: { 
        type : mongoose.Schema.Types.ObjectId,
        ref : "Coupon",
    },
    deliveryDate: {
        type: Date
    },
    shippingDate: {
        type: Date
    },
    paymentMethod: {
        type: String,
        required: true
    },
    paymentStatus: {
        type: String,
        required: true
    },
    orderStatus: {
        type: String,
        enum: ["Pending", "Shipped", "Delivered", "Cancelled", "Returned"],
        default: "Pending"
    },
}, { timestamps: true });

const Orders = mongoose.model("Orders", orderSchema);

module.exports = Orders;