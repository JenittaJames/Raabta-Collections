const productModel = require("../../models/productSchema");
const cartModel = require("../../models/cartSchema");
const addressModel = require("../../models/addressSchema")



const checkout = async (req, res) => {
    try {
      const userId = req.session.userId;
  
      const userAddress = await addressModel.findOne({ userId });
  
      // Fetch cart details
      const cartDetails = await cartModel
        .findOne({ user: userId })
        .populate("cartItem.productId", "productName price productImage");
  
      // Calculate total price
      let totalPrice = 0;
      if (cartDetails) {
        totalPrice = cartDetails.cartItem.reduce((acc, item) => acc + item.total, 0);
      }
  
      // Log data for debugging
      console.log("User Address:", userAddress);
  
      // Render the checkout page with data
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
  


module.exports = {
    checkout,

}