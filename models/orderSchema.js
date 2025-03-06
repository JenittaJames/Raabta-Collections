const mongoose = require('mongoose');
const {Schema} = mongoose;

const orderSchema = new Schema({
    userId : {
        type :  mongoose.Schema.ObjectId,
        ref : "User",
    },
    cartId: {
        type :  mongoose.Schema.ObjectId,
        ref : "Cart"
    },
    deliveryAddress: { 
        type: mongoose.Schema.Types.ObjectId,
        ref: "Address",
        required: true
    },
    orderNumber : {
        type : String,
        required : true,
        unique: true
    },
    orderedItem : [{
        productId : {
            type :  mongoose.Schema.ObjectId,
            ref : "Product",
        },
        quantity : {
            type : Number,
            required : true,
        },
        productPrice : {
            type : Number,
            required : true,
        },
        productStatus : {
            type : String,
            default : "pending",
            required : true
        },
        totalProductPrice : {
            type : Number,
            required : true
        },
    }],
    orderAmount : {
        type : Number,
        required : true
    },
    deliveryDate : {
        type : Date
    },
    shippingDate : {
        type : Date
    },
    paymentMethod : {
        type : String,
        required : true
    },
    paymentStatus : {
        type : String,
        required : true
    },
    orderStatus: { 
        type: String,
        enum: ["Pending", "Confirmed", "Shipped", "Delivered", "Cancelled"], 
        default: "Pending" 
    }
},{ timestamps : true });

const Orders = mongoose.model("Orders", orderSchema);

module.exports = Orders;