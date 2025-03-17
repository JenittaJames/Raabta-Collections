const mongoose = require("mongoose");
const {Schema} = mongoose;


const userSchema = new Schema({
    userName: {
        type: String,
        required: true
    },
    email: {
        type: String,
        required: true,
        unique: true
    },
    phone: {
        type: String,
        required : false,
    },
    password: {
        type: String,
        required: false
    },
    status: {
        type: Boolean,
        default: true
    },
    isAdmin: {
        type: Boolean,
        default: false
    },
    wishlist: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Product'
      }],
      referralCode: {
        type: String,
        required: false
      },
      referredBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
      },
},{timestamps:true});


const User =  mongoose.model("User",userSchema);


module.exports = User;