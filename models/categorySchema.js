const mongoose = require("mongoose");
const {Schema} = mongoose;


const categorySchema = new mongoose.Schema({
    name : {
        type : String,
        required : true
    },
    description : {
        type : String,
        required : true,
    },
    status : {
        type : Boolean,
        default : true,
        required : true
    },
},{timestamps:true})


const Category = mongoose.model("Category",categorySchema);


module.exports = Category;