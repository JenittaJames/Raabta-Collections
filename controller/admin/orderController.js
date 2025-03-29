const productModel = require("../../models/productSchema");
const userModel = require("../../models/userSchema");
const ordersModel = require("../../models/orderSchema");
const addressModel = require("../../models/addressSchema");
const walletModel = require("../../models/walletSchema");

const orders = async (req, res) => {
  try {
    const { query } = req.query;
    const searchQuery = query || "";

    const limit = 10;
    const page = parseInt(req.query.page) || 1;

    let searchFilter = {};

    if (searchQuery) {
      const matchingUsers = await userModel
        .find({
          userName: { $regex: searchQuery, $options: "i" },
        })
        .select("_id");

      const userIds = matchingUsers.map((user) => user._id);

      searchFilter = {
        $or: [
          { orderNumber: { $regex: searchQuery, $options: "i" } },
          { orderStatus: { $regex: searchQuery, $options: "i" } },
          { paymentStatus: { $regex: searchQuery, $options: "i" } },
          { userId: { $in: userIds } },
        ],
      };
    }

    const totalOrders = await ordersModel.countDocuments(searchFilter);
    const totalPages = Math.ceil(totalOrders / limit);

    const ordersData = await ordersModel
      .find(searchFilter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .populate("userId", "userName");

    const orders = ordersData.map((order) => {
      const hasReturnRequest = order.orderedItem.some(
        (item) => item.productStatus === "Return Requested"
      );

      const hasReturnApproved = order.orderedItem.some(
        (item) => item.productStatus === "Return Approved"
      );

      const hasReturnRejected = order.orderedItem.some(
        (item) => item.productStatus === "Return Rejected"
      );

      return {
        id: order._id,
        orderNumber:
          order.orderNumber || order._id.toString().slice(-6).toUpperCase(),
        userName: order.userId ? order.userId.userName : "Unknown",
        orderDate: order.createdAt,
        totalAmount: order.orderAmount,
        finalAmount: order.finalAmount,
        status: order.orderStatus,
        paymentStatus: order.paymentStatus,
        hasReturnRequest,
        hasReturnApproved,
        hasReturnRejected,
      };
    });

    res.render("admin/orders", {
      orders,
      searchQuery,
      currentPage: page,
      totalPages,
      limit
    });
  } catch (error) {
    console.error("Error fetching orders:", error);
    res.status(500).send("Error loading orders");
  }
};

const orderDetails = async (req, res) => {
  try {
    const orderId = req.params.orderId;

    const order = await ordersModel
      .findById(orderId)
      .populate({
        path: "orderedItem.productId",
        model: "Product",
        select: "price productName productImage productDescription",
      })
      .populate("userId")
      .populate("couponApplied");

    if (!order) {
      return res.status(404).render("error", { message: "Order not found" });
    }

    // Convert order to plain object to avoid Mongoose document issues
    const orderData = order.toObject();

    const address =
      orderData.deliveryAddress?.length > 0
        ? orderData.deliveryAddress[0]
        : await addressModel.findOne({ userId: orderData.userId });

    let originalSubtotal = 0;
    let discountedSubtotal = 0;
    let totalDiscount = 0;
    const shippingCharge = orderData.shippingCharge || 0;

    // Use the order-level discountAmount instead of calculating from item-level fields
    const orderLevelDiscount = Number(orderData.discountAmount) || 0;
    const totalOriginalPrice = orderData.orderedItem.reduce(
      (sum, item) => sum + (Number(item.totalProductPrice) || 0),
      0
    );

    const enhancedOrderItems = orderData.orderedItem.map((item) => {
      const quantity = Number(item.quantity) || 1;

      // Use schema fields directly for pricing
      let originalUnitPrice = Number(item.productPrice) || 0; // Original price per unit
      let originalTotal =
        Number(item.totalProductPrice) || originalUnitPrice * quantity; // Original total (price * quantity)

      // If the item prices are 0 or incorrect, calculate them based on order totals
      if (originalUnitPrice === 0 || originalTotal === 0) {
        // Pro-rate the orderAmount across items based on quantity
        const totalQuantity = orderData.orderedItem.reduce(
          (sum, item) => sum + (Number(item.quantity) || 1),
          0
        );
        originalTotal =
          (orderData.orderAmount || 0) * (quantity / totalQuantity);
        originalUnitPrice = originalTotal / quantity;
        item.productPrice = originalUnitPrice; // Update the item for display
        item.totalProductPrice = originalTotal;
      }

      // Pro-rate the order-level discount across items based on their original totals
      let itemDiscount = 0;
      let finalTotal = originalTotal;

      if (totalOriginalPrice > 0 && orderLevelDiscount > 0) {
        itemDiscount =
          (orderLevelDiscount * originalTotal) / totalOriginalPrice;
        finalTotal = originalTotal - itemDiscount;
      }

      // Update the item with the corrected final price
      const discountedUnitPrice = finalTotal / quantity;
      item.finalProductPrice = discountedUnitPrice;
      item.finalTotalProductPrice = finalTotal;

      // Update subtotals and total discount
      originalSubtotal += originalTotal;
      discountedSubtotal += finalTotal;
      totalDiscount += itemDiscount;

      const enhancedItem = {
        ...item,
        originalUnitPrice,
        originalTotal,
        finalTotal,
        itemDiscount: itemDiscount || 0,
        quantity,
      };
      return enhancedItem;
    });

    // Update the plain object
    orderData.orderedItem = enhancedOrderItems;

    const appliedCoupon = orderData.couponApplied
      ? {
          couponCode: orderData.couponApplied.couponCode,
          type: orderData.couponApplied.type,
          discount: orderData.couponApplied.discount,
        }
      : null;

    const finalPrice = discountedSubtotal + shippingCharge;

    // Update the order totals to reflect the discount
    orderData.orderAmount = originalSubtotal;
    orderData.finalAmount = finalPrice;

    res.render("admin/orderdetails", {
      order: orderData,
      address,
      originalSubtotal,
      discountedSubtotal,
      totalDiscount,
      shippingCharge,
      appliedCoupon,
      finalPrice,
    });
  } catch (error) {
    console.error("Error in admin orderDetails:", error);
    res
      .status(500)
      .render("error", { message: "Failed to load order details" });
  }
};

const verifyReturnRequest = async (req, res) => {
  try {
    const { orderId, productId, status } = req.body;

    const order = await ordersModel.findById(orderId).populate({
      path: "orderedItem.productId",
      model: "Product",
      select: "price productName productImage productDescription",
    });

    if (!order) {
      return res
        .status(404)
        .json({ success: false, message: "Order not found" });
    }

    const orderItem = order.orderedItem.find(
      (item) => item._id.toString() === productId
    );
    if (!orderItem) {
      return res
        .status(404)
        .json({ success: false, message: "Product not found in this order" });
    }

    // Update the product status
    orderItem.productStatus = status;
    orderItem.updatedAt = new Date();

    if (status === "Return Approved") {
      if (orderItem.refunded) {
        return res
          .status(400)
          .json({
            success: false,
            message: "This item has already been refunded",
          });
      }

      const wallet = await walletModel.findOne({ userId: order.userId });
      if (!wallet) {
        return res
          .status(404)
          .json({ success: false, message: "Wallet not found for the user" });
      }

      // Calculate finalTotal for refund (mirroring orderDetails logic)
      const quantity = Number(orderItem.quantity) || 1;
      let originalUnitPrice = Number(orderItem.productPrice) || 0;
      let originalTotal =
        Number(orderItem.totalProductPrice) || originalUnitPrice * quantity;

      // If original prices are missing or incorrect, pro-rate based on order totals
      if (originalUnitPrice === 0 || originalTotal === 0) {
        const totalQuantity = order.orderedItem.reduce(
          (sum, item) => sum + (Number(item.quantity) || 1),
          0
        );
        originalTotal = (order.orderAmount || 0) * (quantity / totalQuantity);
        originalUnitPrice = originalTotal / quantity;
      }

      // Calculate item-level discount based on order-level discount
      const orderLevelDiscount = Number(order.discountAmount) || 0;
      const totalOriginalPrice = order.orderedItem.reduce(
        (sum, item) => sum + (Number(item.totalProductPrice) || 0),
        0
      );
      let itemDiscount = 0;
      let finalTotal = originalTotal;

      if (totalOriginalPrice > 0 && orderLevelDiscount > 0) {
        itemDiscount =
          (orderLevelDiscount * originalTotal) / totalOriginalPrice;
        finalTotal = originalTotal - itemDiscount;
      }

      // Use finalTotal as the refund amount
      const refundAmount = finalTotal;

      wallet.balance += refundAmount;
      wallet.transaction.push({
        amount: refundAmount,
        transactionsMethod: "Refund",
        date: new Date(),
        orderId: order._id,
        description: `Amount refunded for returned product`,
      });

      orderItem.refunded = true;
      orderItem.finalTotalProductPrice = refundAmount; // Optionally store this for reference
      await wallet.save();

      // Determine refund status for online payments
      const isOnlinePayment = ["Online", "Wallet", "Card", "UPI"].includes(
        order.paymentMethod
      );
      const allItemsReturned = order.orderedItem.every(
        (item) =>
          item.productStatus === "Return Approved" ||
          item.productStatus === "Cancelled"
      );

      if (allItemsReturned) {
        order.orderStatus = "Returned";
        if (isOnlinePayment) {
          order.paymentStatus = "Refunded";
        }
      } else if (isOnlinePayment) {
        order.paymentStatus = "partially-refunded";
      }

      // Update inventory
      const product = await productModel.findById(orderItem.productId);
      if (product) {
        product.totalStock += orderItem.quantity;
        await product.save();
      }
    }

    await order.save();

    return res.json({
      success: true,
      message: `Return request ${
        status === "Return Approved"
          ? "approved and refund processed"
          : "rejected"
      }`,
      productStatus: orderItem.productStatus,
      returnReason: orderItem.returnReason,
    });
  } catch (error) {
    console.error("Error processing return verification:", error);
    return res
      .status(500)
      .json({
        success: false,
        message: "Failed to process return verification",
      });
  }
};

const updateOrderStatus = async (req, res) => {
  try {
    const { orderId, orderStatus, paymentStatus } = req.body;

    if (!orderId) {
      return res
        .status(400)
        .json({ success: false, message: "Order ID is required" });
    }

    const order = await ordersModel.findById(orderId);
    if (!order) {
      return res
        .status(404)
        .json({ success: false, message: "Order not found" });
    }

    // For online payments, always ensure payment status is 'Paid'
    const isOnlinePayment = ["Online", "Wallet", "Card", "UPI"].includes(
      order.paymentMethod
    );

    if (orderStatus) {
      order.orderStatus = orderStatus;
    }

    // If payment status is provided and this is NOT an online payment, update it
    // For online payments, we ignore manual payment status changes
    if (paymentStatus && !isOnlinePayment) {
      order.paymentStatus = paymentStatus;
    } else if (isOnlinePayment) {
      // For online payments, always ensure it's marked as paid
      order.paymentStatus = "Paid";
    }

    // Automatically set payment status to 'paid' if order is delivered and payment method is COD
    if (orderStatus === "Delivered" && order.paymentMethod === "COD") {
      order.paymentStatus = "Paid";
    }

    await order.save();

    return res.json({
      success: true,
      message: "Order status updated successfully",
      order: {
        id: order._id,
        orderStatus: order.orderStatus,
        paymentStatus: order.paymentStatus,
      },
    });
  } catch (error) {
    console.error("Error updating order status:", error);
    return res
      .status(500)
      .json({
        success: false,
        message: "Failed to update order status: " + error.message,
      });
  }
};

const updateProductStatus = async (req, res) => {
  try {
    const { orderId, productId, productStatus } = req.body;

    if (!orderId || !productId || !productStatus) {
      return res
        .status(400)
        .json({
          success: false,
          message: "Order ID, Product ID, and Product Status are required",
        });
    }

    const validStatuses = [
      "Pending",
      "Shipped",
      "Delivered",
      "Cancelled",
      "Returned",
      "Return Requested",
      "Return Approved",
      "Return Rejected",
    ];
    if (!validStatuses.includes(productStatus)) {
      return res
        .status(400)
        .json({
          success: false,
          message: `Invalid product status. Valid values are: ${validStatuses.join(
            ", "
          )}`,
        });
    }

    const order = await ordersModel.findById(orderId);
    if (!order) {
      return res
        .status(404)
        .json({ success: false, message: "Order not found" });
    }

    const product = order.orderedItem.find(
      (item) => item._id.toString() === productId
    );
    if (!product) {
      return res
        .status(404)
        .json({ success: false, message: "Product not found in this order" });
    }

    product.productStatus = productStatus;

    const allProductStatuses = order.orderedItem.map(
      (item) => item.productStatus
    );
    if (allProductStatuses.every((status) => status === "Delivered")) {
      order.orderStatus = "Delivered";

      // If payment method is COD and all items are delivered, mark payment as paid
      if (order.paymentMethod === "COD") {
        order.paymentStatus = "Paid";
      }
    } else if (allProductStatuses.every((status) => status === "Cancelled")) {
      order.orderStatus = "Cancelled";
    } else if (allProductStatuses.some((status) => status === "Returned")) {
      order.orderStatus = "Returned";
    } else if (allProductStatuses.every((status) => status === "Shipped")) {
      order.orderStatus = "Shipped";
    } else if (
      allProductStatuses.some((status) => status === "Shipped") &&
      allProductStatuses.every(
        (status) => status === "Shipped" || status === "Delivered"
      )
    ) {
      order.orderStatus = "Delivered";
    } else {
      order.orderStatus = "Pending";
    }

    await order.save();

    return res.json({
      success: true,
      message: "Product status updated successfully",
      product: {
        id: product._id,
        productStatus: product.productStatus,
      },
    });
  } catch (error) {
    console.error("Error updating product status:", error);
    return res
      .status(500)
      .json({
        success: false,
        message: "Failed to update product status: " + error.message,
      });
  }
};

const submitReturnRequest = async (req, res) => {
  try {
    const { orderId, productId, reason } = req.body;

    const order = await ordersModel.findById(orderId);
    if (!order) {
      return res
        .status(404)
        .json({ success: false, message: "Order not found" });
    }

    if (order.userId.toString() !== req.session.userId) {
      return res.status(403).json({ success: false, message: "Unauthorized" });
    }

    const orderItem = order.orderedItem.find(
      (item) => item._id.toString() === productId
    );
    if (!orderItem) {
      return res
        .status(404)
        .json({ success: false, message: "Product not found in this order" });
    }

    if (orderItem.productStatus !== "Delivered") {
      return res
        .status(400)
        .json({
          success: false,
          message: "Only delivered items can be returned",
        });
    }

    const deliveryDate = new Date(orderItem.deliveredAt || order.updatedAt);
    const currentDate = new Date();
    const daysSinceDelivery = Math.floor(
      (currentDate - deliveryDate) / (1000 * 60 * 60 * 24)
    );

    if (daysSinceDelivery > 7) {
      return res
        .status(400)
        .json({
          success: false,
          message: "Return window has expired (7 days)",
        });
    }

    orderItem.productStatus = "Return Requested";
    orderItem.returnReason = reason;
    orderItem.updatedAt = new Date();

    await order.save();

    return res.json({
      success: true,
      message: "Return request submitted successfully",
    });
  } catch (error) {
    console.error("Error submitting return request:", error);
    return res
      .status(500)
      .json({ success: false, message: "Failed to submit return request" });
  }
};

module.exports = {
  orders,
  orderDetails,
  verifyReturnRequest,
  updateOrderStatus,
  updateProductStatus,
  submitReturnRequest,
};
