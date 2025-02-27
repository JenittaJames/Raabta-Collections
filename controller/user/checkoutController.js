const productModel = require("../../models/productSchema");
const cartModel = require("../../models/cartSchema");
const addressModel = require("../../models/addressSchema")



const checkout = async (req, res) => {
    try {

      const userId = req.session.userId;
  
      const userAddress = await addressModel.findOne({ userId });
  
      const cartDetails = await cartModel
        .findOne({ user: userId })
        .populate("cartItem.productId", "productName price productImage");
  
      let totalPrice = 0;
      if (cartDetails) {
        totalPrice = cartDetails.cartItem.reduce((acc, item) => acc + item.total, 0);
      }


      req.session.totalPrice = totalPrice
  
      res.render("user/checkout", {
        userAddress: userAddress ? userAddress.address[0] : null,
        cartItems: cartDetails ? cartDetails.cartItem : [], 
        totalPrice,
      });
    } catch (error) {
      console.error("Error in checkout controller:", error);
      res.status(500).send("Server Error");
    }
  };


  const placingOrder = async (req,res) => {
    try {
      const totalPrice = req.session.totalPrice;
      res.render('user/placingorder',{totalPrice})
    } catch (error) {
      console.log("error occured while rendering proceed to buy",error);
    }
  }
  


module.exports = {
    checkout,
    placingOrder,
}