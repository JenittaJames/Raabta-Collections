const productModel = require("../../models/productSchema");
const cartModel = require("../../models/cartSchema");
const addressModel = require("../../models/addressSchema");
const couponModel = require("../../models/couponSchema");
const offerModel = require("../../models/offerSchema");
const userModel = require("../../models/userSchema");
const orderModel = require("../../models/orderSchema")

const razorpay=require('../../config/razorpay')
const mongoose = require("mongoose");

const checkout = async (req, res) => {
  try {
    const userId = req.session.userId;

    const user = await userModel.findById(userId).populate("referralRewards.offerId");
    const userAddresses = await addressModel.find({ userId });
    const availableCoupons = await couponModel.find({ status: true });

    if (!userAddresses || userAddresses.length === 0) {
      req.session.addressRequired = true;
      return res.redirect('/createaddress');
    } else {
      req.session.addressRequired = false;
      if (!req.session.deliveryAddressId) {
        req.session.deliveryAddressId = userAddresses[0]._id.toString();
      }
    }

    const cartDetails = await cartModel
      .findOne({ user: userId })
      .populate("cartItem.productId", "productName price productImage category");

    let totalPrice = req.session.originalSubtotal || 0;
    let cartTotal = req.session.discountedSubtotal || 0;
    let offerDiscountAmount = req.session.cartTotalDiscount || 0;
    let couponDiscountAmount = 0;
    let referralDiscountAmount = 0;
    const appliedOffers = {};
    let activeOffers = [];

    if (cartDetails && cartDetails.cartItem.length > 0) {
      totalPrice = cartDetails.cartItem.reduce((acc, item) => acc + (item.quantity * item.productId.price), 0);
      cartTotal = req.session.discountedSubtotal || totalPrice - offerDiscountAmount;

      activeOffers = await offerModel.find({
        status: true,
        startDate: { $lte: new Date() },
        endDate: { $gte: new Date() },
        $or: [{ maxUses: null }, { $expr: { $gt: ["$maxUses", "$usedCount"] } }],
      }).populate("productId categoryId");

      for (const item of cartDetails.cartItem) {
        const productOffers = activeOffers.filter(
          (offer) =>
            offer.offerType === "product" &&
            offer.productId.some((p) => p._id.equals(item.productId._id))
        );
        const categoryOffers = activeOffers.filter(
          (offer) =>
            offer.offerType === "category" &&
            offer.categoryId.some((c) => c._id.equals(item.productId.category))
        );
        const allOffers = [...productOffers, ...categoryOffers];

        if (allOffers.length > 0) {
          const bestOffer = allOffers.reduce((max, offer) =>
            offer.discount > max.discount ? offer : max
          );
          const originalItemPrice = item.quantity * item.productId.price;
          const itemDiscount = (originalItemPrice * bestOffer.discount) / 100;
          offerDiscountAmount += itemDiscount;
          appliedOffers[item.productId._id] = {
            name: bestOffer.offerName,
            discount: bestOffer.discount,
            discountAmount: itemDiscount,
          };
        }
      }

      offerDiscountAmount = totalPrice - cartTotal;
      if (offerDiscountAmount < 0) offerDiscountAmount = 0;

    }

    const appliedCoupon = req.session.appliedCoupon || null;
    const appliedOffer = req.session.appliedOffer || null;

    if (appliedCoupon) {
      if (appliedCoupon.discountType === "percentage") {
        couponDiscountAmount = (totalPrice * appliedCoupon.discountValue) / 100;
      } else if (appliedCoupon.discountType === "flat") {
        couponDiscountAmount = appliedCoupon.discountValue;
      }
      const remainingPriceAfterOffer = totalPrice - offerDiscountAmount;
      couponDiscountAmount = Math.min(couponDiscountAmount, remainingPriceAfterOffer);
      req.session.couponDiscountAmount = couponDiscountAmount;
    } else {
      req.session.couponDiscountAmount = 0;
    }

    if (appliedOffer && appliedOffer.offerType === "referral") {
      referralDiscountAmount = appliedOffer.discountAmount || 0;
      offerDiscountAmount += referralDiscountAmount;
    }

    const totalDiscountAmount = offerDiscountAmount + couponDiscountAmount;
    const finalPrice = totalPrice - totalDiscountAmount;

    req.session.totalPrice = totalPrice;
    req.session.cartTotal = cartTotal;
    req.session.offerDiscountAmount = offerDiscountAmount;
    req.session.couponDiscountAmount = couponDiscountAmount;
    req.session.totalDiscountAmount = totalDiscountAmount;
    req.session.finalPrice = finalPrice;


    const referralOffers = user.referralRewards
      .filter((reward) => !reward.used && reward.offerId.endDate >= new Date())
      .map((reward) => reward.offerId);

    activeOffers = [...activeOffers, ...referralOffers];

    const couponMessage = req.session.couponMessage || null;
    const couponSuccess = req.session.couponSuccess || null;

    res.render("user/checkout", {
      userAddresses: userAddresses || [],
      selectedAddressId: req.session.deliveryAddressId,
      cartItems: cartDetails ? cartDetails.cartItem : [],
      totalPrice,
      cartTotal,
      appliedCoupon,
      appliedOffer,
      offerDiscountAmount,
      couponDiscountAmount,
      referralDiscountAmount,
      totalDiscountAmount,
      finalPrice,
      couponMessage,
      couponSuccess,
      availableCoupons,
      activeOffers,
      appliedOffers,
      referralOffers,
      userId: req.session.userId,
      addressRequired: req.session.addressRequired,
    });

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
    const userId = req.session.userId;
    const user = await userModel.findById(userId);
    const totalPrice = req.session.totalPrice;
    const finalPrice = req.session.finalPrice || totalPrice;
    const appliedCoupon = req.session.appliedCoupon;


    res.render("user/placingorder", {
      totalPrice,
      finalPrice,
      appliedCoupon,
      user
    });
  } catch (error) {
    console.log("Error occurred while rendering proceed to buy", error);
    res.status(500).send("Server Error");
  }
};

const applyOffer = async (req, res) => {
  try {
    const { offerId } = req.body;
    const userId = req.session.userId;

    // Fetch the user with referral rewards
    const user = await userModel.findById(userId).populate("referralRewards.offerId");
    const totalPrice = req.session.totalPrice;

    // Find the referral offer in the user's referral rewards
    const referralReward = user.referralRewards.find(
      (reward) =>
        reward.offerId._id.toString() === offerId &&
        !reward.used &&
        reward.offerId.endDate >= new Date()
    );

    if (!referralReward) {
      return res.status(400).json({
        success: false,
        message: "Invalid or expired referral offer",
      });
    }

    const offer = referralReward.offerId;

    // Calculate discount amount based on percentage
    let discountAmount = (totalPrice * offer.discount) / 100;

    // Ensure discount does not exceed total price
    discountAmount = Math.min(discountAmount, totalPrice);

    // Update session with offer details
    req.session.appliedOffer = {
      id: offer._id,
      name: offer.offerName,
      discount: offer.discount,
      discountAmount: discountAmount,
      offerType: "referral",
    };
    req.session.referralDiscountAmount = discountAmount;

    // Recalculate final price
    const offerDiscountAmount = req.session.offerDiscountAmount || 0;
    const couponDiscountAmount = req.session.couponDiscountAmount || 0;
    const totalDiscountAmount = offerDiscountAmount + couponDiscountAmount + discountAmount;
    req.session.totalDiscountAmount = totalDiscountAmount;
    req.session.finalPrice = totalPrice - totalDiscountAmount;

    res.json({
      success: true,
      message: "Referral offer applied successfully",
      discountAmount,
      finalPrice: req.session.finalPrice,
    });
  } catch (error) {
    console.error("Error applying offer:", error);
    res.status(500).json({
      success: false,
      message: "Error applying offer",
    });
  }
};



const removeOffer = async (req, res) => {
  try {
    const userId = req.session.userId;

    if (!req.session.appliedOffer) {
      return res.status(400).json({
        success: false,
        message: "No offer applied to remove",
      });
    }

    // Clear offer-related session data
    const removedDiscountAmount = req.session.referralDiscountAmount || 0;
    delete req.session.appliedOffer;
    delete req.session.referralDiscountAmount;

    // Recalculate totals
    const totalPrice = req.session.totalPrice;
    const offerDiscountAmount = req.session.offerDiscountAmount - removedDiscountAmount || 0;
    const couponDiscountAmount = req.session.couponDiscountAmount || 0;
    const totalDiscountAmount = offerDiscountAmount + couponDiscountAmount;
    req.session.offerDiscountAmount = offerDiscountAmount;
    req.session.totalDiscountAmount = totalDiscountAmount;
    req.session.finalPrice = totalPrice - totalDiscountAmount;

    res.json({
      success: true,
      message: "Referral offer removed successfully",
      finalPrice: req.session.finalPrice,
    });
  } catch (error) {
    console.error("Error removing offer:", error);
    res.status(500).json({
      success: false,
      message: "Error removing offer",
    });
  }
};


const createOrder = async (req, res) => {
  try {
    const { amount } = req.body;
    const userId = req.session.userId;

    const cart = await cartModel.findOne({ user: userId }).populate("cartItem.productId");
    if (!cart || cart.cartItem.length === 0) {
      return res.status(400).json({ error: 'No items in cart' });
    }

    const deliveryAddressId = req.session.deliveryAddressId;
    if (!deliveryAddressId || !mongoose.Types.ObjectId.isValid(deliveryAddressId)) {
      return res.status(400).json({ error: 'No valid delivery address found' });
    }

    const address = await addressModel.findById(deliveryAddressId);
    if (!address) {
      return res.status(400).json({ error: 'Selected address not found' });
    }

    const totalPrice = req.session.totalPrice || 0;
    const finalPrice = req.session.finalPrice || totalPrice;
    const offerDiscountAmount = req.session.offerDiscountAmount || 0;
    const couponDiscountAmount = req.session.couponDiscountAmount || 0;
    const appliedOffers = req.session.appliedOffers || {};
    const appliedCoupon = req.session.appliedCoupon || null;

    // Calculate total amount and apply discounts per item
    let totalAmount = 0;
    const orderedItems = cart.cartItem.map((item) => {
      const productPrice = item.productId.price;
      const quantity = item.quantity;
      const totalProductPrice = productPrice * quantity;
      totalAmount += totalProductPrice;

      let itemOfferDiscount = appliedOffers[item.productId._id]?.discountAmount || 0;
      let itemCouponDiscount = couponDiscountAmount > 0 ? (totalProductPrice / totalPrice) * couponDiscountAmount : 0;
      const totalDiscountPerItem = itemOfferDiscount + itemCouponDiscount;
      const finalTotalProductPrice = totalProductPrice - totalDiscountPerItem;
      const finalProductPrice = finalTotalProductPrice / quantity;

      return {
        productId: item.productId._id,
        quantity,
        productPrice,
        finalProductPrice,
        totalProductPrice,
        finalTotalProductPrice,
        productStatus: "Pending",
      };
    });

    const discountAmount = offerDiscountAmount + couponDiscountAmount;
    const finalAmount = totalAmount - discountAmount;

    const amountInPaise = Math.floor(parseFloat(amount) * 100) || 0;

    if (isNaN(amountInPaise) || amountInPaise <= 0) {
      return res.status(400).json({ error: 'Invalid amount' });
    }

    // Check if amount exceeds Razorpay's maximum limit (1 billion paise = 10 crore INR)
    const MAX_AMOUNT_IN_PAISE = 100000000000; // 1 billion paise (10 crore INR)
    if (amountInPaise > MAX_AMOUNT_IN_PAISE) {
      return res.status(400).json({ error: `Amount exceeds maximum allowed limit of ₹${MAX_AMOUNT_IN_PAISE / 100}` });
    }

    const receipt = 'order_rcpt_' + Date.now() + '_' + Math.floor(Math.random() * 1000);
    const options = {
      amount: amountInPaise,
      currency: 'INR',
      receipt: receipt,
    };

    const order = await razorpay.orders.create(options);

    req.session.tempOrder = {
      userId,
      cartId: cart._id,
      deliveryAddress: deliveryAddressId,
      orderAmount: totalAmount,
      discountAmount,
      finalAmount,
      couponApplied: req.session.appliedCoupon ? req.session.appliedCoupon.id : null,
      appliedOffer: req.session.appliedOffer ? req.session.appliedOffer.id : null,
      orderedItem: orderedItems,
      paymentMethod: 'Online Payment',
      paymentStatus: 'Pending',
      orderStatus: 'Pending',
    };


    return res.json({
      id: order.id,
      amount: order.amount,
      currency: order.currency,
      key_id: process.env.RAZORPAY_KEY_ID,
    });
  } catch (error) {
    console.error('Razorpay order creation error:', error);
    return res.status(500).json({ error: 'Failed to create payment order' });
  }
};

const verifyPayment = async (req, res) => {
  try {
    const { payment, order } = req.body;
    const userId = req.session.userId;

    const crypto = require('crypto');
    const shasum = crypto.createHmac('sha256', process.env.RAZORPAY_KEY_SECRET);
    shasum.update(order.id + '|' + payment.razorpay_payment_id);
    const digest = shasum.digest('hex');

    if (digest !== payment.razorpay_signature) {
      return res.status(400).json({
        success: false,
        message: 'Payment verification failed',
      });
    }

    const tempOrder = req.session.tempOrder;
    if (!tempOrder) {
      return res.status(400).json({
        success: false,
        message: 'No order data found in session',
      });
    }

    if (!tempOrder.deliveryAddress || !mongoose.Types.ObjectId.isValid(tempOrder.deliveryAddress)) {
      console.error('Invalid deliveryAddress in tempOrder:', tempOrder.deliveryAddress);
      return res.status(400).json({
        success: false,
        message: 'Invalid delivery address',
      });
    }

    const orderNumber = "ORD" + Math.floor(Math.random() * 1000000);
    const newOrder = new orderModel({
      ...tempOrder,
      orderNumber,
      paymentStatus: 'Paid',
      razorpayPaymentId: payment.razorpay_payment_id,
      razorpayOrderId: order.id,
      razorpaySignature: payment.razorpay_signature,
    });

    await newOrder.save();

    if (tempOrder.couponApplied) {
      await couponModel.updateOne(
        { _id: tempOrder.couponApplied },
        { $push: { usedBy: { userId, orderId: newOrder._id } } }
      );
    }

    for (let item of tempOrder.orderedItem) {
      await productModel.updateOne(
        { _id: item.productId },
        { $inc: { totalStock: -item.quantity } }
      );
    }

    await cartModel.deleteOne({ user: userId });

    // Clear all session data
    delete req.session.tempOrder;
    delete req.session.appliedCoupon;
    delete req.session.discountAmount;
    delete req.session.finalPrice;
    delete req.session.totalPrice;
    delete req.session.offerDiscountAmount;
    delete req.session.couponDiscountAmount;
    delete req.session.appliedOffers;
    delete req.session.appliedOffer;
    delete req.session.deliveryAddressId;
    delete req.session.totalDiscountAmount;
    delete req.session.cartTotal;

    return res.json({
      success: true,
      message: 'Payment verified successfully',
      orderId: newOrder._id,
    });
  } catch (error) {
    console.error('Payment verification error:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error',
    });
  }
};


const selectAddress = async (req, res) => {
  try {
    const { addressId } = req.body;
    
    if (!addressId || !mongoose.Types.ObjectId.isValid(addressId)) {
      return res.status(400).json({
        success: false,
        message: "Valid Address ID is required"
      });
    }

    const address = await addressModel.findOne({ _id: addressId, userId: req.session.userId });
    if (!address) {
      return res.status(404).json({
        success: false,
        message: "Address not found"
      });
    }

    req.session.deliveryAddressId = addressId;
    await req.session.save(); 
    
    return res.json({
      success: true,
      message: "Delivery address updated successfully",
      selectedAddressId: addressId
    });
  } catch (error) {
    console.error("Error selecting address:", error);
    return res.status(500).json({
      success: false,
      message: "Error updating delivery address"
    });
  }
};



module.exports = {
  checkout,
  applyCoupon,
  removeCoupon,
  placingOrder,
  applyOffer,
  removeOffer,
  createOrder,
  verifyPayment,
  selectAddress
};