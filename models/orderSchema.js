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
        returnReason : {
            type : String,
        }
    }],
    deliveryAddress : {
        type : Array,
        required : true
    },
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
},{ timestamps : true });

const Orders = mongoose.model("Orders", orderSchema);

module.exports = Orders;