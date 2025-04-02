const userModel = require("../../models/userSchema");
const addressModel = require("../../models/addressSchema");
const ordersModel = require("../../models/orderSchema");
const cartModel = require("../../models/cartSchema");
const productModel = require("../../models/productSchema");
const couponModel = require("../../models/couponSchema")
const walletModel = require("../../models/walletSchema")
const PDFDocument = require('pdfkit');
const path = require('path');
const mongoose = require("mongoose");
const razorpay=require('../../config/razorpay')

const orders = async (req, res) => {
  try {

    const userId = req.session.userId;

    const page = parseInt(req.query.page) || 1;
    const limit = 3;
    const skip = (page - 1) * limit;

    const user = await userModel.findById(userId);
    const totalOrders = await ordersModel.countDocuments({ userId: req.session.userId });
    const totalPages = Math.ceil(totalOrders / limit);

    const orders = await ordersModel
      .find({ userId: req.session.userId })
      .populate({
        path: "orderedItem.productId",
        model: "Product", 
      })
      .populate("userId")
      .sort("-createdAt")
      .skip(skip)
      .limit(limit);

    res.render('user/orders', {
      orders,
      user,
      pagination: {
        page,
        limit,
        totalOrders,
        totalPages,
        hasNextPage: page < totalPages,
        hasPrevPage: page > 1,
        nextPage: page + 1,
        prevPage: page - 1,
      },
    });
  } catch (error) {
    console.error("Error in loadOrders:", error);
    res.render("orders", { orders: [], error: "Failed to load orders" });
  }
};



const placeOrder = async (req, res) => {
  try {
    const userId = req.session.userId;
    const paymentMethod = req.body.paymentMethod || "Cash on Delivery";
    const user = await userModel.findById(userId);
    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    const cart = await cartModel.findOne({ user: userId }).populate("cartItem.productId");
    if (!cart || cart.cartItem.length === 0) {
      return res.status(400).json({ success: false, message: "No items in cart" });
    }

    const deliveryAddressId = req.session.deliveryAddressId;
    if (!deliveryAddressId || !mongoose.Types.ObjectId.isValid(deliveryAddressId)) {
      return res.status(400).json({ success: false, message: "No valid delivery address selected" });
    }

    const address = await addressModel.findById(deliveryAddressId);
    if (!address || !address.address.length) {
      return res.status(400).json({ success: false, message: "Selected delivery address not found" });
    }

    const totalPrice = req.session.totalPrice || 0;
    const finalPrice = req.session.finalPrice || totalPrice;
    const offerDiscountAmount = req.session.offerDiscountAmount || 0;
    const couponDiscountAmount = req.session.couponDiscountAmount || 0;
    const appliedOffers = req.session.appliedOffers || {};
    const appliedCoupon = req.session.appliedCoupon || null;

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

    let walletUsedAmount = 0;
    if (paymentMethod === "Wallet") {
      const wallet = await walletModel.findOne({ userId });
      if (!wallet || wallet.balance < finalAmount) {
        return res.status(400).json({
          success: false,
          message: "Insufficient wallet balance",
        });
      }
      walletUsedAmount = finalAmount;
      wallet.balance -= walletUsedAmount;
      wallet.transaction.push({
        amount: -walletUsedAmount,
        transactionsMethod: "Payment",
        orderId: null,
        date: new Date(),
      });
      await wallet.save();
    }

    const orderNumber = "ORD" + Math.floor(Math.random() * 1000000);
    const newOrder = new ordersModel({
      userId,
      cartId: cart._id,
      deliveryAddress: address._id,
      orderNumber,
      orderedItem: orderedItems,
      orderAmount: totalAmount,
      discountAmount,
      finalAmount,
      couponApplied: appliedCoupon ? appliedCoupon.id : null,
      appliedOffer: req.session.appliedOffer ? req.session.appliedOffer.id : null,
      paymentMethod,
      paymentStatus: paymentMethod === "Wallet" ? "Completed" : "Pending",
      orderStatus: "Pending",
    });

    const savedOrder = await newOrder.save();

    if (paymentMethod === "Wallet") {
      await walletModel.updateOne(
        { userId, "transaction.orderId": null },
        { $set: { "transaction.$.orderId": savedOrder._id } }
      );
    }

    if (appliedCoupon) {
      await couponModel.updateOne(
        { _id: appliedCoupon.id },
        { $push: { usedBy: { userId, orderId: savedOrder._id } } }
      );
    }

    for (let item of orderedItems) {
      await productModel.updateOne(
        { _id: item.productId },
        { $inc: { totalStock: -item.quantity } }
      );
    }

    await cartModel.deleteOne({ user: userId });

    delete req.session.appliedCoupon;
    delete req.session.discountAmount;
    delete req.session.finalPrice;
    delete req.session.totalPrice;
    delete req.session.offerDiscountAmount;
    delete req.session.couponDiscountAmount;
    delete req.session.appliedOffers;
    delete req.session.appliedOffer;

    res.render("user/confirmorder", {
      order: {
        customerName: user.username || user.name || "Customer",
        orderNumber,
        _id: savedOrder._id,
        orderAmount: totalAmount,
        discountAmount,
        finalAmount,
        items: orderedItems,
        orderStatus: savedOrder.orderStatus,
        paymentMethod,
        walletUsedAmount,
        couponApplied: appliedCoupon ? { couponCode: appliedCoupon.code } : null,
      },
    });
  } catch (error) {
    console.error("Error occurred while placing the order:", error);
    res.status(500).json({ success: false, message: "An error occurred while placing your order", error: error.message });
  }
};



const orderDetails = async (req, res) => {
  try {
    const orderId = req.params.orderId;
    const userId = req.session.userId;

    const order = await ordersModel
      .findOne({ _id: orderId, userId })
      .populate({
        path: "orderedItem.productId",
        model: "Product",
      })
      .populate("userId")
      .populate("couponApplied")
      .populate("deliveryAddress");

    if (!order) {
      return res.status(404).render("error", { message: "Order not found" });
    }

    const address = await addressModel.findOne({ userId: userId });

    const appliedCoupon = order.couponApplied
      ? {
          couponCode: order.couponApplied.couponCode,
          type: order.couponApplied.type,
          discount: order.couponApplied.discount,
        }
      : null;

    res.render("user/orderdetails", {
      order,
      address: order.deliveryAddress,
      appliedCoupon,
      discountAmount: order.discountAmount || 0,
      finalPrice: order.finalAmount || order.orderAmount,
    });
  } catch (error) {
    console.error("Error in getOrderDetails:", error);
    res.status(500).render("error", { message: "Failed to load order details" });
  }
};




const cancelOrder = async (req, res) => {
  try {
    const orderId = req.params.orderId || req.body.orderId || req.query.orderId;

    const order = await ordersModel.findById(orderId);

    if (!order) {
      return res
        .status(404)
        .json({ success: false, message: "Order not found" });
    }

    order.orderStatus = "Cancelled";

    order.orderedItem.forEach((item) => {
      item.productStatus = "Cancelled";
    });

    for (const item of order.orderedItem) {
      const product = await productModel.findById(item.productId);
      if (product) {
        product.totalStock += item.quantity;
        await product.save();
      }
    }

    if (["Online Payment", "Wallet Payment"].includes(order.paymentMethod)) {
      const wallet = await walletModel.findOne({ userId: order.userId });

      if (wallet) {
        wallet.balance += order.finalAmount;
        wallet.transaction.push({
          amount: order.finalAmount,
          transactionsMethod: "Refund",
          orderId: order._id,
          description: `Cancellation Refund for ${order.paymentMethod} order ${order.orderNumber}`
        });
        await wallet.save();
      }
    }

    await order.save();

    return res
      .status(200)
      .json({ success: true, message: "Order cancelled and refunded successfully" });
  } catch (error) {
    console.warn("Error cancelling order:", error);
    return res
      .status(500)
      .json({ success: false, message: "Failed to cancel order" });
  }
};


const generateInvoice = async (req, res) => {
  try {
    const orderId = req.params.orderId;

    const order = await ordersModel
      .findById(orderId)
      .populate('orderedItem.productId')
      .populate('userId', 'userName email phone')
      .populate('deliveryAddress')
      .populate('couponApplied');

    if (!order) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }

    const doc = new PDFDocument({ margin: 50 });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=invoice-${order.orderNumber}.pdf`);

    doc.pipe(res);

    const imagePath = path.join(__dirname, '../../public/user/assets/images/menu/logo/1.png');

    doc.image(imagePath, 50, 100, { width: 100 });

    doc.fontSize(20).text('Raabta Collections - Invoice', { align: 'center' });
    doc.moveDown();

    doc.fontSize(12).text(`Invoice #: INV-${order.orderNumber}`, { align: 'right' });
    doc.fontSize(12).text(`Order #: ${order.orderNumber}`, { align: 'right' });
    doc.fontSize(12).text(`Date: ${new Date(order.createdAt).toLocaleDateString()}`, { align: 'right' });
    doc.moveDown();

    doc.fontSize(14).text('Customer Information', { underline: true });
    doc.fontSize(10).text(`Name: ${order.userId?.userName || 'N/A'}`);
    doc.fontSize(10).text(`Email: ${order.userId?.email || 'N/A'}`);
    doc.fontSize(10).text(`Phone: ${order.userId?.phone || 'N/A'}`);
    doc.moveDown();

    if (order.deliveryAddress && order.deliveryAddress.address && order.deliveryAddress.address.length > 0) {
      const addr = order.deliveryAddress.address[0];
      doc.fontSize(14).text('Shipping Address', { underline: true });
      doc.fontSize(10).text(`${addr.name || ''}`);
      doc.fontSize(10).text(`${[addr.houseName, addr.street, addr.city, addr.state, addr.pincode, addr.country].filter(Boolean).join(', ')}`);
      doc.fontSize(10).text(`Phone: ${addr.mobile || ''}`);
      doc.moveDown();
    }

    //order items table
    doc.fontSize(14).text('Order Items', { underline: true });
    doc.moveDown();

    // Table header
    let y = doc.y;
    doc.fontSize(10);
    doc.text('Item', 50, y);
    doc.text('Price', 250, y);
    doc.text('Qty', 320, y);
    doc.text('Total', 380, y);
    doc.moveDown();

    y = doc.y;
    doc.moveTo(50, y).lineTo(550, y).stroke();
    doc.moveDown();

    // Table rows
    if (order.orderedItem && order.orderedItem.length > 0) {
      order.orderedItem.forEach((item) => {
        const productName = item.productId?.productName || 'Unknown Product';

        y = doc.y;
        doc.fontSize(10).text(productName, 50, y, { width: 180 });
        doc.text(`₹${item.productPrice.toFixed(2)}`, 250, y);
        doc.text(`${item.quantity}`, 320, y);
        doc.text(`₹${item.totalProductPrice.toFixed(2)}`, 380, y);
        doc.moveDown();
      });
    }

    // Draw a line
    y = doc.y;
    doc.moveTo(50, y).lineTo(550, y).stroke();
    doc.moveDown();

    // Add totals
    doc.fontSize(10).text('Items Total:', 300, doc.y);
    doc.text(`₹${order.orderAmount.toFixed(2)}`, 380, doc.y);
    doc.moveDown();

    if (order.discountAmount && order.discountAmount > 0) {
      doc.fontSize(10).text('Discount:', 300, doc.y);
      doc.text(`-₹${order.discountAmount.toFixed(2)}`, 380, doc.y);
      doc.moveDown(0.5);
    }

    if (order.couponApplied) {
      doc.fontSize(10).text('Coupon Applied:', 300, doc.y);
      doc.text(`${order.couponApplied.couponCode}`, 380, doc.y);
      doc.moveDown(0.5);
    }

    doc.fontSize(12).text('Final Amount:', 300, doc.y, { bold: true });
    doc.fontSize(12).text(`₹${order.finalAmount.toFixed(2)}`, 380, doc.y, { bold: true });
    doc.moveDown();

 
    doc.fontSize(10).text('Thank you for your business!', { align: 'center' });
    doc.moveDown();
    doc.fontSize(8).text('This is a computer-generated invoice and does not require a signature.', { align: 'center' });

    doc.end();
  } catch (error) {
    console.error('Error generating invoice:', error);
    res.status(500).json({ success: false, message: 'Failed to generate invoice' });
  }
};



  const orderConfirmation = async (req, res) => {
    try {
      const orderId = req.params.orderId;
      const order = await ordersModel.findById(orderId)
        .populate('userId')
        .populate('orderedItem.productId');
  
      if (!order) {
        return res.status(404).send("Order not found");
      }
  
      res.render("user/confirmorder", {
        order: {
          customerName: order.userId.username || order.userId.name || "Customer",
          orderNumber: order.orderNumber,
          _id: order._id,
          orderAmount: order.orderAmount,
          discountAmount: order.discountAmount,
          finalAmount: order.finalAmount,
          items: order.orderedItem,
          orderStatus: order.orderStatus,
          couponApplied: order.couponApplied ? { couponCode: "Applied" } : null,
        },
      });
    } catch (error) {
      console.error("Error in order confirmation:", error);
      res.status(500).send("Server Error");
    }
  };



  const getWalletBalance = async (req, res) => {
    try {
      const userId = req.session.userId;
      const wallet = await walletModel.findOne({ userId });
      
      if (!wallet) {
        return res.json({ success: true, balance: 0 });
      }
      
      return res.json({ success: true, balance: wallet.balance });
    } catch (error) {
      console.error("Error fetching wallet balance:", error);
      return res.json({ success: false, message: "Failed to fetch wallet balance" });
    }
  };
  

  const placeOrderWallet = async (req, res) => {
    try {
      const userId = req.session.userId;
      const user = await userModel.findById(userId);
      const cart = await cartModel.findOne({ user: userId }).populate("cartItem.productId");
  
      if (!cart || cart.cartItem.length === 0) {
        return res.status(400).json({ success: false, message: "No items in cart" });
      }
  
      const deliveryAddressId = req.session.deliveryAddressId;
      if (!deliveryAddressId || !mongoose.Types.ObjectId.isValid(deliveryAddressId)) {
        return res.status(400).json({ success: false, message: "No valid delivery address selected" });
      }
  
      const address = await addressModel.findById(deliveryAddressId);
      if (!address || !address.address.length) {
        return res.status(400).json({ success: false, message: "Selected delivery address not found" });
      }
  
      const totalPrice = req.session.totalPrice || 0;
      const finalPrice = req.session.finalPrice || totalPrice;
      const offerDiscountAmount = req.session.offerDiscountAmount || 0;
      const couponDiscountAmount = req.session.couponDiscountAmount || 0;
      const appliedOffers = req.session.appliedOffers || {};
      const appliedCoupon = req.session.appliedCoupon || null;

      const wallet = await walletModel.findOne({ userId });
      if (!wallet || wallet.balance < finalPrice) {
        return res.status(400).json({ 
          success: false, 
          message: "Insufficient wallet balance", 
          walletBalance: wallet ? wallet.balance : 0,
          requiredAmount: finalPrice
        });
      }
  
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
  
      const orderNumber = "ORD" + Math.floor(Math.random() * 1000000);
      const newOrder = new ordersModel({
        userId,
        cartId: cart._id,
        deliveryAddress: address._id,
        orderNumber,
        orderedItem: orderedItems,
        orderAmount: totalAmount,
        discountAmount,
        finalAmount,
        couponApplied: appliedCoupon ? appliedCoupon.id : null,
        appliedOffer: req.session.appliedOffer ? req.session.appliedOffer.id : null,
        paymentMethod: "Wallet",
        paymentStatus: "Paid", 
        orderStatus: "Pending",
      });
  
      await newOrder.save();
  
      wallet.balance -= finalAmount;
      wallet.transaction.push({
        amount: -finalAmount,
        transactionsMethod: "Payment",
        orderId: newOrder._id,
        description : `Order Placed via Wallet for order no: ${orderNumber} `
      });
      await wallet.save();
  
      if (appliedCoupon) {
        await couponModel.updateOne(
          { _id: appliedCoupon.id },
          { $push: { usedBy: { userId, orderId: newOrder._id } } }
        );
      }
  
      for (let item of orderedItems) {
        await productModel.updateOne(
          { _id: item.productId },
          { $inc: { totalStock: -item.quantity } }
        );
      }
  
      await cartModel.deleteOne({ user: userId });
  
      delete req.session.appliedCoupon;
      delete req.session.discountAmount;
      delete req.session.finalPrice;
      delete req.session.totalPrice;
      delete req.session.offerDiscountAmount;
      delete req.session.couponDiscountAmount;
      delete req.session.appliedOffers;
      delete req.session.appliedOffer;
  
      return res.status(200).json({ 
        success: true, 
        message: "Order placed successfully using wallet", 
        orderId: newOrder._id 
      });
    } catch (error) {
      console.error("Error occurred while placing the order with wallet:", error);
      return res.status(500).json({ 
        success: false, 
        message: "An error occurred while placing your order" 
      });
    }
  };


  const saveFailedPayment = async (req, res) => {
    try {
      const { orderId, error } = req.body;
      const userId = req.session.userId;
      const cart = await cartModel.findOne({ user: userId }).populate("cartItem.productId");
      const address = await addressModel.findById(req.session.deliveryAddressId);
  
      const totalPrice = req.session.totalPrice || 0;
      const offerDiscountAmount = req.session.offerDiscountAmount || 0;
      const couponDiscountAmount = req.session.couponDiscountAmount || 0;
      const appliedOffers = req.session.appliedOffers || {};
      const appliedCoupon = req.session.appliedCoupon || null;
  
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
          totalProductPrice,
          finalProductPrice,
          finalTotalProductPrice,
          productStatus: "Pending",
        };
      });
  
      const discountAmount = offerDiscountAmount + couponDiscountAmount;
      const finalAmount = totalAmount - discountAmount;
  
      const newOrder = new ordersModel({
        userId,
        cartId: cart._id,
        deliveryAddress: address._id,
        orderNumber: "ORD" + Math.floor(Math.random() * 1000000),
        orderedItem: orderedItems,
        orderAmount: totalAmount,
        discountAmount,
        finalAmount,
        paymentMethod: "Online Payment",
        paymentStatus: "Failed",
        orderStatus: "Pending",
        razorpayOrderId: orderId,
        couponApplied: appliedCoupon ? appliedCoupon.id : null,
        appliedOffer: req.session.appliedOffer ? req.session.appliedOffer.id : null,
      });
  
      await newOrder.save();
      res.status(200).json({ success: true });
    } catch (error) {
      console.error("Error saving failed payment:", error);
      res.status(500).json({ success: false, message: "Failed to save payment attempt" });
    }
  };
  
  const retryPayment = async (req, res) => {
    try {
      const { orderId } = req.body;
      const order = await ordersModel.findById(orderId);
  
      if (!order || order.paymentStatus !== "Failed") {
        return res.status(400).json({ success: false, message: "Invalid order for retry" });
      }
  
      const amountInPaise = Math.floor(order.finalAmount * 100);
      const options = {
        amount: amountInPaise,
        currency: "INR",
        receipt: `retry_rcpt_${order.orderNumber}_${Date.now()}`,
      };
  
      const newRazorpayOrder = await razorpay.orders.create(options);
  
      // Update the existing order with the new Razorpay order ID
      await ordersModel.updateOne(
        { _id: orderId },
        { razorpayOrderId: newRazorpayOrder.id }
      );
  
      res.status(200).json({
        success: true,
        key_id: process.env.RAZORPAY_KEY_ID,
        amount: newRazorpayOrder.amount,
        currency: newRazorpayOrder.currency,
        orderId: newRazorpayOrder.id,
        originalOrderId: orderId 
      });
    } catch (error) {
      console.error("Error in retry payment:", error);
      res.status(500).json({ success: false, message: "Failed to initiate retry" });
    }
  };



module.exports = {
  orders,
  orderDetails,
  placeOrder,
  cancelOrder,
  generateInvoice,
  orderConfirmation,
  placeOrderWallet,
  getWalletBalance,
  saveFailedPayment,
  retryPayment,
};
