const productModel = require("../../models/productSchema");
const cartModel = require("../../models/cartSchema");
const catModel = require("../../models/categorySchema");
const offerModel = require("../../models/offerSchema");

const loadCart = async (req, res) => {
  try {
    const userId = req.session.userId;
    const cartDetails = await cartModel.find({ user: userId }).populate({
      path: "cartItem.productId",
      select: "productName price productImage totalStock category status",
      populate: { path: "category", select: "status"},
    });

    if (cartDetails.length > 0 && cartDetails[0].cartItem && cartDetails[0].cartItem.length > 0) {
      const originalCartItems = [...cartDetails[0].cartItem];
      let hasRemovedItems = false;
      
      // Filter out invalid products (inactive products or products with inactive categories)
      cartDetails[0].cartItem = cartDetails[0].cartItem.filter(item => {
        if (!item.productId) return false;
        
        const isProductActive = item.productId.status === true;
        const isCategoryActive = item.productId.category && item.productId.category.status === true;
        
        if (!isProductActive || !isCategoryActive) {
          hasRemovedItems = true;
          return false;
        }
        return true;
      });
      
      // If items were removed, save the updated cart
      if (hasRemovedItems) {
        const cart = await cartModel.findOne({ user: userId });
        if (cart) {
          cart.cartItem = cartDetails[0].cartItem;
          // Recalculate cart total
          cart.cartTotal = cart.cartItem.reduce((acc, item) => acc + item.total, 0);
          await cart.save();
        }
      }
    }

    const appliedOffers = {};
    let originalSubtotal = 0;
    let discountedSubtotal = 0;
    let totalDiscount = 0;

    if (
      cartDetails.length > 0 &&
      cartDetails[0].cartItem &&
      cartDetails[0].cartItem.length > 0
    ) {
      const activeOffers = await offerModel.find({
        status: true,
        startDate: { $lte: new Date() },
        endDate: { $gte: new Date() },
      });

      for (const item of cartDetails[0].cartItem) {
        if (!item.productId) continue;

        const productIdString = item.productId._id.toString();
        const originalItemPrice = item.productId.price;
        const originalItemTotal = originalItemPrice * item.quantity;
        originalSubtotal += originalItemTotal;

        const productOffers = activeOffers.filter(
          (offer) =>
            offer.offerType === "product" &&
            offer.productId &&
            offer.productId.some((p) => p && p.toString() === productIdString)
        );

        const categoryOffers = [];
        if (item.productId.category) {
          const categoryIdString = item.productId.category._id.toString();
          categoryOffers.push(
            ...activeOffers.filter(
              (offer) =>
                offer.offerType === "category" &&
                offer.categoryId &&
                offer.categoryId.some(
                  (c) => c && c.toString() === categoryIdString
                )
            )
          );
        }

        const allOffers = [...productOffers, ...categoryOffers];

        if (allOffers.length > 0) {
          const bestOffer = allOffers.reduce(
            (max, offer) => (offer.discount > max.discount ? offer : max),
            allOffers[0]
          );

          const discountAmount = (originalItemPrice * bestOffer.discount) / 100;
          const discountedPrice = originalItemPrice - discountAmount;
          const discountedItemTotal = discountedPrice * item.quantity;

          item.price = discountedPrice;
          item.total = discountedItemTotal;

          // Store offer details for this product
          appliedOffers[productIdString] = {
            name: bestOffer.offerName,
            discount: bestOffer.discount,
            discountedPrice: discountedPrice,
            originalPrice: originalItemPrice,
            discountAmount: discountAmount,
            itemDiscountTotal: discountAmount * item.quantity,
          };

          discountedSubtotal += discountedItemTotal;
        } else {
          item.price = originalItemPrice;
          item.total = originalItemTotal;
          discountedSubtotal += originalItemTotal;
        }
      }

      totalDiscount = originalSubtotal - discountedSubtotal;

      cartDetails[0].cartTotal = discountedSubtotal;
    }

    const cartSummary = {
      originalSubtotal,
      discountedSubtotal,
      totalDiscount,
      itemCount:
        cartDetails.length > 0 && cartDetails[0].cartItem
          ? cartDetails[0].cartItem.length
          : 0,
    };

    req.session.originalSubtotal = originalSubtotal;
    req.session.discountedSubtotal = discountedSubtotal;
    req.session.cartTotalDiscount = totalDiscount;

    res.render("user/cart", {
      cartDetails,
      appliedOffers,
      cartSummary,
    });
  } catch (error) {
    console.error("Error in rendering cart page:", error);
    res.status(500).send("Server Error");
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

    const product = await productModel.findOne({
      _id: productId,
      status: true,
    });
    if (!product) {
      return res.status(404).json({ message: "Product not found" });
    }

    const category = await catModel.findById(product.category);
    if (!category || category.status === false) {
      return res
        .status(400)
        .json({ message: "This product's category is no longer available" });
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

    const productOffers = await offerModel
      .find({
        status: true,
        offerType: "product",
        productId: productId,
        startDate: { $lte: new Date() },
        endDate: { $gte: new Date() },
        $or: [{ maxUses: null }, { maxUses: { $gt: 0 } }],
      })
      .sort({ discount: -1 });

    const categoryOffers = await offerModel
      .find({
        status: true,
        offerType: "category",
        categoryId: product.category,
        startDate: { $lte: new Date() },
        endDate: { $gte: new Date() },
        $or: [{ maxUses: null }, { maxUses: { $gt: 0 } }],
      })
      .sort({ discount: -1 });

    const allOffers = [...productOffers, ...categoryOffers];
    const bestOffer =
      allOffers.length > 0
        ? allOffers.reduce(
            (max, offer) => (offer.discount > max.discount ? offer : max),
            allOffers[0]
          )
        : null;

    const unitPrice = bestOffer
      ? product.price - (product.price * bestOffer.discount) / 100
      : product.price;

    if (existingItemIndex > -1) {
      const newQuantity =
        cart.cartItem[existingItemIndex].quantity + parseInt(quantity);

      if (newQuantity > MAX_QUANTITY) {
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
      cart.cartItem[existingItemIndex].price = unitPrice;
      cart.cartItem[existingItemIndex].stock = product.totalStock;
      cart.cartItem[existingItemIndex].total = newQuantity * unitPrice;
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
        price: unitPrice,
        stock: product.totalStock,
        total: parseInt(quantity) * unitPrice,
      };

      cart.cartItem.push(newItem);
    }

    cart.cartTotal = cart.cartItem.reduce((acc, item) => acc + item.total, 0);

    await cart.save();

    if (bestOffer) {
      req.session.appliedOffer = {
        id: bestOffer._id,
        name: bestOffer.offerName,
        discount: bestOffer.discount,
        discountAmount: ((product.price * bestOffer.discount) / 100) * quantity,
      };
    }

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

    if (updatedCart) {
      updatedCart.cartTotal = updatedCart.cartItem.reduce(
        (acc, curr) => curr.total + acc,
        0
      );
      await updatedCart.save();
    }

    res.redirect("/cart");
  } catch (error) {
    console.error(error);
    res.status(500).send("Error removing item");
  }
};

const updateCartQuantity = async (req, res) => {
  try {
    const { productId, quantity } = req.body;
    const userId = req.session.userId;
    const MAX_QUANTITY = 7;

    if (!productId || !quantity || quantity < 1) {
      return res.status(400).json({ message: "Invalid product or quantity" });
    }

    if (quantity > MAX_QUANTITY) {
      return res.status(400).json({
        message: `Maximum quantity per product is ${MAX_QUANTITY}`,
      });
    }

     // Check if product is active
     const product = await productModel.findById(productId);
     if (!product || product.status === false) {
       return res.status(404).json({ message: "Product not available" });
     }

     const category = await catModel.findById(product.category);
     if (!category || category.status === false) {
       return res.status(400).json({ message: "This product's category is no longer available" });
     }

    if (product.totalStock < quantity) {
      return res.status(400).json({
        message: `Only ${product.totalStock} items available in stock`,
      });
    }

    const cart = await cartModel
      .findOne({ user: userId })
      .populate("cartItem.productId", "price totalStock category");
    if (!cart) {
      return res.status(404).json({ message: "Cart not found" });
    }

    const itemIndex = cart.cartItem.findIndex(
      (item) => item.productId._id.toString() === productId
    );
    if (itemIndex === -1) {
      return res.status(404).json({ message: "Product not found in cart" });
    }

    const activeOffers = await offerModel
      .find({
        status: true,
        startDate: { $lte: new Date() },
        endDate: { $gte: new Date() },
        $or: [{ maxUses: null }, { maxUses: { $gt: 0 } }],
      })
      .populate("productId categoryId");

    const filterOffersByUsedCount = (offers) => {
      return offers.filter((offer) => {
        if (offer.maxUses === null) return true;
        return offer.usedCount < offer.maxUses;
      });
    };

    const filteredOffers = filterOffersByUsedCount(activeOffers);

    // Calculate discounted price
    const productOffers = filteredOffers.filter(
      (offer) =>
        offer.offerType === "product" &&
        offer.productId.some((p) => p._id.equals(productId))
    );
    const categoryOffers = filteredOffers.filter(
      (offer) =>
        offer.offerType === "category" &&
        offer.categoryId.some((c) => c._id.equals(product.category))
    );
    const allOffers = [...productOffers, ...categoryOffers];
    const bestOffer =
      allOffers.length > 0
        ? allOffers.reduce((max, offer) =>
            offer.discount > max.discount ? offer : max
          )
        : null;

    const unitPrice = bestOffer
      ? product.price - (product.price * bestOffer.discount) / 100
      : product.price;

    
    cart.cartItem[itemIndex].quantity = parseInt(quantity);
    cart.cartItem[itemIndex].price = unitPrice;
    cart.cartItem[itemIndex].stock = product.totalStock;
    cart.cartItem[itemIndex].total = quantity * unitPrice;

    cart.cartTotal = cart.cartItem.reduce((acc, item) => acc + item.total, 0);

    await cart.save();

    // Calculate total offer discount
    const offerDiscount = cart.cartItem.reduce((acc, item) => {
      const itemProduct = item.productId;
      const itemOffers = filteredOffers.filter(
        (offer) =>
          (offer.offerType === "product" &&
            offer.productId.some((p) => p._id.equals(item.productId._id))) ||
          (offer.offerType === "category" &&
            offer.categoryId.some((c) => c._id.equals(itemProduct.category)))
      );
      const itemBestOffer =
        itemOffers.length > 0
          ? itemOffers.reduce((max, offer) =>
              offer.discount > max.discount ? offer : max
            )
          : null;
      if (itemBestOffer) {
        const originalPrice = itemProduct.price;
        const discountedPrice =
          originalPrice - (originalPrice * itemBestOffer.discount) / 100;
        return acc + (originalPrice - discountedPrice) * item.quantity;
      }
      return acc;
    }, 0);

    res.status(200).json({
      message: "Cart updated successfully",
      cartTotal: cart.cartTotal,
      offerDiscount: offerDiscount,
    });
  } catch (error) {
    console.error("Error updating cart:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

const getCartTotals = async (req, res) => {
  try {
    const userId = req.session.userId;

    const cart = await cartModel
      .findOne({ user: userId })
      .populate({
        path: "cartItem.productId",
        select: "price category status",
        populate: { path: "category", select: "status" }
      });

    if (!cart || !cart.cartItem.length) {
      return res.json({
        cartTotal: 0,
        offerDiscount: 0,
        itemCount: 0,
      });
    }

     // Filter out inactive products or products with inactive categories
     const validCartItems = cart.cartItem.filter(item => {
      if (!item.productId) return false;
      
      const isProductActive = item.productId.status === true;
      const isCategoryActive = item.productId.category && item.productId.category.status === true;
      
      return isProductActive && isCategoryActive;
    });

    const activeOffers = await offerModel
      .find({
        status: true,
        startDate: { $lte: new Date() },
        endDate: { $gte: new Date() },
        $or: [{ maxUses: null }, { maxUses: { $gt: 0 } }],
      })
      .populate("productId categoryId");

    const filterOffersByUsedCount = (offers) => {
      return offers.filter((offer) => {
        if (offer.maxUses === null) return true;
        return offer.usedCount < offer.maxUses;
      });
    };

    const filteredOffers = filterOffersByUsedCount(activeOffers);

    const offerDiscount = cart.cartItem.reduce((acc, item) => {
      const itemProduct = item.productId;
      const itemOffers = filteredOffers.filter(
        (offer) =>
          (offer.offerType === "product" &&
            offer.productId.some((p) => p._id.equals(item.productId._id))) ||
          (offer.offerType === "category" &&
            offer.categoryId.some((c) => c._id.equals(itemProduct.category)))
      );
      const itemBestOffer =
        itemOffers.length > 0
          ? itemOffers.reduce((max, offer) =>
              offer.discount > max.discount ? offer : max
            )
          : null;
      if (itemBestOffer) {
        const originalPrice = itemProduct.price;
        const discountedPrice =
          originalPrice - (originalPrice * itemBestOffer.discount) / 100;
        return acc + (originalPrice - discountedPrice) * item.quantity;
      }
      return acc;
    }, 0);

    return res.json({
      cartTotal: cart.cartTotal,
      offerDiscount: offerDiscount,
      itemCount: cart.cartItem.length,
    });
  } catch (error) {
    console.error("Error fetching cart totals:", error);
    return res.status(500).json({ message: "Error fetching cart totals" });
  }
};

const getCartItem = async (req, res) => {
  try {
    const userId = req.session.userId;
    const { productId } = req.query;

    const cart = await cartModel.findOne({ user: userId });

    if (!cart) {
      return res.status(404).json({ message: "Cart not found" });
    }

    const item = cart.cartItem.find(
      (item) => item.productId.toString() === productId
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


const verifyCartForCheckout = async (req, res) => {
  try {
    const userId = req.session.userId;
    
    const cartDetails = await cartModel.find({ user: userId }).populate({
      path: "cartItem.productId",
      select: "productName price productImage totalStock category status",
      populate: { path: "category", select: "status"},
    });

    let invalidProducts = [];
    
    if (cartDetails.length > 0 && cartDetails[0].cartItem && cartDetails[0].cartItem.length > 0) {
      // Check each item for validity
      for (const item of cartDetails[0].cartItem) {
        if (!item.productId) {
          invalidProducts.push("Unknown product");
          continue;
        }
        
        const isProductActive = item.productId.status === true;
        const isCategoryActive = item.productId.category && item.productId.category.status === true;
        
        if (!isProductActive || !isCategoryActive) {
          invalidProducts.push(item.productId.productName);
        } else if (item.quantity > item.productId.totalStock) {
          return res.json({
            valid: false,
            message: `${item.productId.productName} has only ${item.productId.totalStock} items in stock`
          });
        }
      }
      
      if (invalidProducts.length > 0) {
        return res.json({ 
          valid: false, 
          message: "Some products in your cart are no longer available", 
          invalidProducts 
        });
      }
      
      return res.json({ valid: true });
    } else {
      return res.json({ valid: false, message: "Your cart is empty" });
    }
  } catch (error) {
    console.error("Error verifying cart:", error);
    return res.json({ valid: false, message: "Error verifying cart" });
  }
};



module.exports = {
  loadCart,
  addCart,
  removeCart,
  updateCartQuantity,
  getCartTotals,
  getCartItem,
  verifyCartForCheckout
};
