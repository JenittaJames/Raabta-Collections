const productModel = require("../../models/productSchema");
const cartModel = require("../../models/cartSchema");

const loadCart = async (req, res) => {
  try {
    console.log("Entering to cart page");
    const userId = req.session.userId;
    const cartDetails = await cartModel
      .find({ user: userId })
      .populate("cartItem.productId", "productName price productImage");
    res.render("user/cart", { cartDetails });
  } catch (error) {
    console.log("error in rendering cart page", error);
  }
};

// controller function for adding the product to cart
const addCart = async (req, res) => {
  try {
    console.log("entering the add to cart controller");
    const { productId, quantity } = req.body;
    const userId = req.session.userId;

    if (!productId || !quantity || quantity < 1) {
      return res.status(400).json({ message: "Invalid product or quantity" });
    }

    const product = await productModel.findById(productId);
    if (!product) {
      return res.status(404).json({ message: "Product not found" });
    }

    let cart = await cartModel.findOne({ user: userId });
    if (!cart) {
      cart = new cartModel({
        user: userId,
        cartItem: [],
        cartTotal: 0,
      });
    }

    const existingItemIndex = cart.cartItem.findIndex(
      (item) => item.productId.toString() === productId.toString()
    );

    if (existingItemIndex > -1) {
      const newQuantity =
        cart.cartItem[existingItemIndex].quantity + parseInt(quantity);

      if (newQuantity > product.stock) {
        return res.status(400).json({
          message: `Only ${product.stock} items available in stock`,
        });
      }

      cart.cartItem[existingItemIndex].quantity = newQuantity;
      cart.cartItem[existingItemIndex].price = product.price;
      cart.cartItem[existingItemIndex].stock = product.totalStock;
      cart.cartItem[existingItemIndex].total = newQuantity * product.price;
    } else {
      if (quantity > product.stock) {
        return res.status(400).json({
          message: `Only ${product.stock} items available in stock`,
        });
      }

      const newItem = {
        productId: productId,
        quantity: parseInt(quantity),
        price: product.price,
        stock: product.totalStock,
        total: parseInt(quantity) * product.price,
      };

      cart.cartItem.push(newItem);
    }

    cart.cartTotal = cart.cartItem.reduce((acc, item) => acc + item.total, 0);

    await cart.save();

    // Fetch updated cart with populated product details
    const updatedCart = await cartModel
      .findOne({ _id: cart._id })
      .populate("cartItem.productId", "productName price productImage");

    return res.status(200).json({
      message: "Item added to cart successfully",
    });
  } catch (error) {
    console.error("Error in addCart:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
};

const removeCart = async (req, res) => {
  try {
    const userId = req.session.userId;
    const productId = req.params.productId;
    await cartModel.findOneAndUpdate(
      { user: userId },
      { $pull: { cartItem: { productId: productId } } }
    );

    const updatedCart = await cartModel.findOne({ user: userId });

    let updatedCartTotal = updatedCart.cartItem.reduce(
      (acc, curr) => curr.total + acc,
      0
    );

    updatedCart.cartTotal = updatedCartTotal;

    await updatedCart.save()

    res.redirect("/cart");
  } catch (error) {
    console.error(error);
    res.status(500).send("Error removing item");
  }
};


const updateCartQuantity = async (req, res) => {
  const { productId, quantity } = req.body;

  console.log("req.bodyeeeeee",req.body);

  const userId = req.session.userId

  try {
    // Find the cart item and update the quantity
    
    const cart = await cartModel.findOne({ user : userId });

    console.log("carteeeeeeeeeee",cart);

    if (!cart) {
      return res.status(404).json({ message: 'Cart item not found' });
    }

    // Update the quantity for the specific product
    
    const cartItem = cart.cartItem.find(item => item.productId.toString() === productId);

    console.log("caritemeeeeeeeee", cartItem);

    if (cartItem) {
      cartItem.quantity = quantity;
      cartItem.total = cartItem.price * quantity // Update total price
      cart.cartTotal = cart.cartItem.reduce((acc, item) => acc + item.total, 0); // Update cart total
    }

    await cart.save();

    res.status(200).json({ message: 'Cart updated successfully', cart });
  } catch (error) {
    console.error('Error updating cart:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

module.exports = {
  loadCart,
  addCart,
  removeCart,
  updateCartQuantity,
};
