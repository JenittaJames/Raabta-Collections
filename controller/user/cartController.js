const productModel = require("../../models/productSchema");
const cartModel = require("../../models/cartSchema");
const catModel = require("../../models/categorySchema")

const loadCart = async (req, res) => {
  try {
    const userId = req.session.userId;
    const cartDetails = await cartModel
      .find({ user: userId })
      .populate("cartItem.productId", "productName price productImage totalStock");
    res.render("user/cart", { cartDetails });
  } catch (error) {
    console.log("error in rendering cart page", error);
  }
};


const addCart = async (req, res) => {
  try {
    const { productId, quantity } = req.body;
    const userId = req.session.userId;
    const MAX_QUANTITY = 7;

    if (!productId || !quantity || quantity < 1) {
      return res.status(400).json({ message: "Invalid product or quantity" });
    }

    const product = await productModel.findOne({_id: productId, status: true});

    if (!product) {
      return res.status(404).json({ message: "Product not found" });
    }
    
    // Check if the product's category is still active
    const category = await catModel.findById(product.category);
    if (!category || category.status === false) {
      return res.status(400).json({ message: "This product's category is no longer available" });
    }

    if (product.totalStock <= 0 || product.totalStock < quantity) {
      return res.status(400).json({ message: "Out of stock" });
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

      if(newQuantity > MAX_QUANTITY) {
        return res.status(400).json({
          message: `Maximum quantity per product is ${MAX_QUANTITY}`,
        });
      }

      if (newQuantity > product.totalStock) {
        return res.status(400).json({
          message: `Only ${product.totalStock} items available in stock`,
        });
      }

      cart.cartItem[existingItemIndex].quantity = newQuantity;
      cart.cartItem[existingItemIndex].price = product.price;
      cart.cartItem[existingItemIndex].stock = product.totalStock;
      cart.cartItem[existingItemIndex].total = newQuantity * product.price;
    } else {
      if (quantity > MAX_QUANTITY) {
        return res.status(400).json({
          message: `Maximum quantity per product is ${MAX_QUANTITY}`,
        });
      }

      if (quantity > product.totalStock) {
        return res.status(400).json({
          message: `Only ${product.totalStock} items available in stock`,
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

    await updatedCart.save();

    res.redirect("/cart");
  } catch (error) {
    console.error(error);
    res.status(500).send("Error removing item");
  }
};

const updateCartQuantity = async (req, res) => {
  const { productId, quantity } = req.body;
  const userId = req.session.userId;
  const MAX_QUANTITY = 7;

  try {
    if (!productId || !quantity || quantity < 1) {
      return res.status(400).json({ message: "Invalid product or quantity" });
    }

    if (quantity > MAX_QUANTITY) {
      return res.status(400).json({
        message: `Maximum quantity per product is ${MAX_QUANTITY}`,
      });
    }

    const product = await productModel.findById(productId);
    if (!product) {
      return res.status(404).json({ message: "Product not found" });
    }

    if (product.totalStock < quantity) {
      return res.status(400).json({
        message: `Only ${product.totalStock} items available in stock`,
      });
    }

    const cart = await cartModel.findOne({ user: userId });
    if (!cart) {
      return res.status(404).json({ message: "Cart not found" });
    }

    const cartItem = cart.cartItem.find(
      (item) => item.productId.toString() === productId
    );

    if (!cartItem) {
      return res.status(404).json({ message: "Product not found in cart" });
    }

    cartItem.quantity = parseInt(quantity);
    cartItem.total = cartItem.price * quantity;
    cartItem.stock = product.totalStock;
    
    cart.cartTotal = cart.cartItem.reduce((acc, item) => acc + item.total, 0);

    await cart.save();

    res.status(200).json({ message: "Cart updated successfully" });
  } catch (error) {
    console.error("Error updating cart:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

// NEW FUNCTION: Get cart totals
const getCartTotals = async (req, res) => {
  try {
    const userId = req.session.userId;
    
    const cart = await cartModel.findOne({ user: userId });
    
    if (!cart) {
      return res.json({ cartTotal: 0, itemCount: 0 });
    }
    
    return res.json({ 
      cartTotal: cart.cartTotal, 
      itemCount: cart.cartItem.length 
    });
  } catch (error) {
    console.error("Error fetching cart totals:", error);
    return res.status(500).json({ message: "Error fetching cart totals" });
  }
};

// NEW FUNCTION: Get specific cart item
const getCartItem = async (req, res) => {
  try {
    const userId = req.session.userId;
    const { productId } = req.query;
    
    const cart = await cartModel.findOne({ user: userId });
    
    if (!cart) {
      return res.status(404).json({ message: "Cart not found" });
    }
    
    const item = cart.cartItem.find(
      item => item.productId.toString() === productId
    );
    
    if (!item) {
      return res.status(404).json({ message: "Item not found in cart" });
    }
    
    return res.json(item);
  } catch (error) {
    console.error("Error fetching cart item:", error);
    return res.status(500).json({ message: "Error fetching cart item" });
  }
};

module.exports = {
  loadCart,
  addCart,
  removeCart,
  updateCartQuantity,
  getCartTotals,  // Export the new function
  getCartItem     // Export the new function
};