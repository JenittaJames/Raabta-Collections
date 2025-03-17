const productModel = require("../../models/productSchema");
const cartModel = require("../../models/cartSchema");
const addressModel = require("../../models/addressSchema");
const couponModel = require("../../models/couponSchema");
const mongoose = require('mongoose');

const checkout = async (req, res) => {
  try {
    const userId = req.session.userId;

    // Fetch user address
    const userAddress = await addressModel.findOne({ userId });

    // Check if the user has a delivery address
    if (!userAddress || !userAddress.address || userAddress.address.length === 0) {
      req.session.addressRequired = true; // Set a flag to indicate address is required
    } else {
      req.session.addressRequired = false; // Clear the flag if address exists
    }

    // Fetch cart details with product information
    const cartDetails = await cartModel
      .findOne({ user: userId })
      .populate("cartItem.productId", "productName price productImage");

    // Calculate total price
    let totalPrice = 0;
    if (cartDetails) {
      totalPrice = cartDetails.cartItem.reduce(
        (acc, item) => acc + item.total,
        0
      );
    }

    // Store total price in session
    req.session.totalPrice = totalPrice;

    // Check if a coupon is applied
    const appliedCoupon = req.session.appliedCoupon || null;
    let discountAmount = 0;
    let finalPrice = totalPrice;

    if (appliedCoupon) {
      const { discountType, discountValue } = appliedCoupon;

      // Calculate discount amount
      if (discountType === "percentage") {
        discountAmount = (totalPrice * discountValue) / 100;
      } else if (discountType === "flat") {
        discountAmount = discountValue;
      }

      // Ensure discount does not exceed total price
      discountAmount = Math.min(discountAmount, totalPrice);
      finalPrice = totalPrice - discountAmount;

      // Update session with calculated values
      req.session.discountAmount = discountAmount;
      req.session.finalPrice = finalPrice;
    }

    // Get all coupons first
    const allCoupons = await couponModel.find({
      status: true,
      expiry: { $gt: new Date() },
    });

    // Filter coupons based on user's previous usage
    const availableCoupons = allCoupons.filter(coupon => {
      // Count how many times user has used this coupon with completed orders
      const usedCount = coupon.usedBy.filter(
        use => use.userId.toString() === userId.toString() && use.orderId
      ).length;
      
      // Only show coupons where user hasn't reached the maximum usage
      return usedCount < coupon.maxRedeem;
    });

    // Render the checkout page with all necessary data
    res.render("user/checkout", {
      userAddress: userAddress ? userAddress.address[0] : null,
      cartItems: cartDetails ? cartDetails.cartItem : [],
      totalPrice,
      appliedCoupon: req.session.appliedCoupon || null,
      discountAmount,
      finalPrice,
      couponMessage: req.session.couponMessage,
      couponSuccess: req.session.couponSuccess,
      availableCoupons,
      addressRequired: req.session.addressRequired, // Pass the flag to the EJS template
    });

    // Clear coupon-related session messages
    delete req.session.couponMessage;
    delete req.session.couponSuccess;
  } catch (error) {
    console.error("Error in checkout controller:", error);
    res.status(500).send("Server Error");
  }
};


const applyCoupon = async (req, res) => {
  try {
    const { couponCode } = req.body;
    const userId = req.session.userId;

    // Fetch the coupon from the database
    const coupon = await couponModel.findOne({
      couponCode: couponCode.toUpperCase(),
      status: true,
      expiry: { $gt: new Date() },
    });

    if (!coupon) {
      return res.status(400).json({
        success: false,
        message: "Invalid or expired coupon code",
      });
    }

    // Check if the cart total meets the minimum price requirement
    const totalPrice = req.session.totalPrice;
    if (totalPrice < coupon.minimumPrice) {
      return res.status(400).json({
        success: false,
        message: `Minimum purchase of ₹${coupon.minimumPrice} required to apply this coupon`,
      });
    }

    // Check if the user has already used this coupon for completed orders
    const completedUsageCount = coupon.usedBy.filter(
      (use) => use.userId.toString() === userId.toString() && use.orderId
    ).length;

    if (completedUsageCount >= coupon.maxRedeem) {
      return res.status(400).json({
        success: false,
        message: `You have already used this coupon the maximum number of times (${coupon.maxRedeem})`,
      });
    }

    // Calculate discount amount
    let discountAmount = 0;
    if (coupon.type === "percentageDiscount") {
      discountAmount = (totalPrice * coupon.discount) / 100;
    } else {
      discountAmount = coupon.discount;
    }

    // Ensure discount does not exceed total price
    discountAmount = Math.min(discountAmount, totalPrice);

    // Update session with coupon details
    req.session.appliedCoupon = {
      id: coupon._id,
      code: coupon.couponCode,
      discountType: coupon.type === "percentageDiscount" ? "percentage" : "flat",
      discountValue: coupon.discount,
      minimumPrice: coupon.minimumPrice,
      maxRedeem: coupon.maxRedeem,
    };
    req.session.discountAmount = discountAmount;
    req.session.finalPrice = totalPrice - discountAmount;

    // Add the user to the usedBy array and save the coupon
    coupon.usedBy.push({ userId: userId });
    await coupon.save();

    res.json({
      success: true,
      message: "Coupon applied successfully",
      discountAmount,
      finalPrice: req.session.finalPrice,
    });
  } catch (error) {
    console.error("Error applying coupon:", error);
    res.status(500).json({
      success: false,
      message: "Error applying coupon",
    });
  }
};


const removeCoupon = async (req, res) => {
  try {
    const userId = req.session.userId;
    const couponCode = req.session.appliedCoupon?.code;

    if (couponCode) {
      // Remove the user from the usedBy array (only if the order is not placed)
      await couponModel.updateOne(
        { couponCode: couponCode.toUpperCase() },
        { $pull: { usedBy: { userId, orderId: { $exists: false } } } }
      );
    }

    // Clear coupon-related session data
    delete req.session.appliedCoupon;
    delete req.session.discountAmount;
    req.session.finalPrice = req.session.totalPrice;
    req.session.couponMessage = "Coupon removed successfully";
    req.session.couponSuccess = true;

    res.redirect("/checkout");
  } catch (error) {
    console.error("Error removing coupon:", error);
    req.session.couponMessage = "Error removing coupon";
    req.session.couponSuccess = false;
    res.redirect("/checkout");
  }
};

const placingOrder = async (req, res) => {
  try {
    const totalPrice = req.session.totalPrice;
    const finalPrice = req.session.finalPrice || totalPrice;
    const appliedCoupon = req.session.appliedCoupon;

    res.render("user/placingorder", {
      totalPrice,
      finalPrice,
      appliedCoupon,
    });
  } catch (error) {
    console.log("error occurred while rendering proceed to buy", error);
    res.status(500).send("Server Error");
  }
};

module.exports = {
  checkout,
  applyCoupon,
  removeCoupon,
  placingOrder,
};