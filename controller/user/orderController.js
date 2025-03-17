const userModel = require("../../models/userSchema");
const addressModel = require("../../models/addressSchema");
const ordersModel = require("../../models/orderSchema");
const cartModel = require("../../models/cartSchema");
const productModel = require("../../models/productSchema");
const couponModel = require("../../models/couponSchema")
const PDFDocument = require('pdfkit');
const path = require('path');

const orders = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = 3;
    const skip = (page - 1) * limit;

    const totalOrders = await ordersModel.countDocuments({ userId: req.session.userId });
    const totalPages = Math.ceil(totalOrders / limit);

    const orders = await ordersModel
      .find({ userId: req.session.userId })
      .populate({
        path: "orderedItem.productId",
        model: "Product", // Make sure this matches your product model name exactly
      })
      .populate("userId")
      .sort("-createdAt")
      .skip(skip)
      .limit(limit);

    res.render('user/orders', {
      orders,
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
      const user = await userModel.findById(userId);

      const cart = await cartModel
          .findOne({ user: userId })
          .populate("cartItem.productId");

      if (!cart || cart.cartItem.length === 0) {
          return res.status(400).send("No items in cart");
      }

      const address = await addressModel.findOne({ userId });

      if (!address) {
          return res.status(400).send("No delivery address found");
      }

      // Calculate total amount
      let totalAmount = 0;
      const orderedItems = cart.cartItem.map((item) => {
          const itemTotal = item.quantity * item.productId.price;
          totalAmount += itemTotal;

          return {
              productId: item.productId._id,
              quantity: item.quantity,
              productPrice: item.productId.price,
              productStatus: "Pending",
              totalProductPrice: itemTotal,
          };
      });

      // Check if a coupon is applied
      let discountAmount = 0;
      let finalAmount = totalAmount;
      let couponApplied = null;

      if (req.session.appliedCoupon) {
          const { discountType, discountValue } = req.session.appliedCoupon;

          // Calculate discount based on coupon type
          if (discountType === "percentage") {
              discountAmount = (totalAmount * discountValue) / 100;
          } else if (discountType === "flat") {
              discountAmount = discountValue;
          }

          // Ensure discount does not exceed total amount
          discountAmount = Math.min(discountAmount, totalAmount);
          finalAmount = totalAmount - discountAmount;

          // Save coupon details
          couponApplied = {
              couponCode: req.session.appliedCoupon.code,
              discountType: discountType,
              discountValue: discountValue,
          };

      }

      const orderNumber = "ORD" + Math.floor(Math.random() * 1000000);

      // Create a new order
      const newOrder = new ordersModel({
          userId: userId,
          cartId: cart._id,
          deliveryAddress: address._id,
          orderNumber: orderNumber,
          orderedItem: orderedItems,
          orderAmount: totalAmount,
          discountAmount: discountAmount, // Add discount amount
          finalAmount: finalAmount, // Add final amount after discount
          couponApplied: req.session.appliedCoupon ? req.session.appliedCoupon.id : null,
          paymentMethod: "Cash on Delivery",
          paymentStatus: "pending",
          orderStatus: "Pending",
      });

      await newOrder.save();

        // Mark the coupon as used in the couponModel
    if (req.session.appliedCoupon) {
      await couponModel.updateOne(
        { _id: req.session.appliedCoupon.id },
        { $push: { usedBy: { userId, orderId: newOrder._id } } }
      );
    }


      // Clear the cart after placing the order
      await cartModel.deleteOne({ user: userId });

      // Update product stock
      for (let i = 0; i < orderedItems.length; i++) {
          const item = orderedItems[i];
          await productModel.updateOne(
              { _id: item.productId },
              { $inc: { totalStock: -item.quantity } }
          );
      }


      // Clear the coupon from the session after applying
      delete req.session.appliedCoupon;
      delete req.session.discountAmount;
      delete req.session.finalPrice;

      // Render the confirmation page
      res.render("user/confirmorder", {
          order: {
              customerName: user.username || user.name || "Customer",
              orderNumber: orderNumber,
              _id: newOrder._id,
              orderAmount: totalAmount,
              discountAmount: discountAmount,
              finalAmount: finalAmount,
              items: orderedItems,
              orderStatus: newOrder.orderStatus,
              couponApplied: couponApplied, // Pass coupon details to the view
          },
      });
  } catch (error) {
      console.log("Error occurred while placing the order", error);
      res.status(500).send("An error occurred while placing your order");
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
      .populate("couponApplied"); 

    if (!order) {
      return res.status(404).render("error", { message: "Order not found" });
    }

    const address = await addressModel.findOne({ userId: userId });

    const appliedCoupon = order.couponApplied || null;

    res.render("user/orderdetails", {
      order,
      address,
      appliedCoupon,
      discountAmount: order.discountAmount, 
      finalPrice: order.finalAmount,
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

    // Update the order status to 'Cancelled'
    order.orderStatus = "Cancelled";

    // Update the status of each product in the orderedItem array
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

    // Save the modified order
    await order.save();

    return res
      .status(200)
      .json({ success: true, message: "Order cancelled successfully" });
  } catch (error) {
    console.warn("Error cancelling order:", error);
    return res
      .status(500)
      .json({ success: false, message: "Failed to cancel order" });
  }
};


const generateInvoice=  async (req, res) => {
    try {
      const orderId = req.params.orderId;
      
      // Fetch order with populated data
      const order = await ordersModel.findById(orderId)
        .populate('orderedItem.productId')
        .populate('userId', 'userName email phone')
        .populate('deliveryAddress');
      
      if (!order) {
        return res.status(404).json({ success: false, message: 'Order not found' });
      }
      
      // Create a PDF document
      const doc = new PDFDocument({ margin: 50 });
      
      // Set response headers for PDF download
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename=invoice-${order.orderNumber}.pdf`);
      
      // Pipe the PDF document to the response
      doc.pipe(res);


      const imagePath = path.join(__dirname, '../../public/user/assets/images/menu/logo/1.png');

      
      // Add company logo or header
      doc.image(imagePath, 50, 100, { width: 100 });
      
      // Add invoice header
      doc.fontSize(20).text('Raabta Collections- Invoice', { align: 'center' });
      doc.moveDown();
      
      // Add invoice and order information
      doc.fontSize(12).text(`Invoice #: INV-${order.orderNumber}`, { align: 'right' });
      doc.fontSize(12).text(`Order #: ${order.orderNumber}`, { align: 'right' });
      doc.fontSize(12).text(`Date: ${new Date(order.createdAt).toLocaleDateString()}`, { align: 'right' });
      doc.moveDown();
      
      // Add customer information
      doc.fontSize(14).text('Customer Information', { underline: true });
      doc.fontSize(10).text(`Name: ${order.userId?.userName || 'N/A'}`);
      doc.fontSize(10).text(`Email: ${order.userId?.email || 'N/A'}`);
      doc.fontSize(10).text(`Phone: ${order.userId?.phone || 'N/A'}`);
      doc.moveDown();
      
      // Add shipping address if available
      if (order.deliveryAddress&& order.deliveryAddress.address && order.deliveryAddress.address.length > 0) {
        const addr = order.deliveryAddress.address[0];
        doc.fontSize(14).text('Shipping Address', { underline: true });
        doc.fontSize(10).text(`${addr.name || ''}`);
        doc.fontSize(10).text(`${[addr.houseName, addr.street, addr.city, addr.state, addr.pincode, addr.country].filter(Boolean).join(', ')}`);
        doc.fontSize(10).text(`Phone: ${addr.mobile || ''}`);
        doc.moveDown();
      }
      
      // Add order items table
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
          doc.text(`Rs.${item.productPrice}`, 250, y);
          doc.text(`${item.quantity}`, 320, y);
          doc.text(`Rs.${item.totalProductPrice}`, 380, y);
          doc.moveDown();
        });
      }
      
      // Draw a line
      y = doc.y;
      doc.moveTo(50, y).lineTo(550, y).stroke();
      doc.moveDown();
      
      // Add totals
      doc.fontSize(10).text('Items Total:', 300, doc.y);
      doc.text(`Rs.${order.totalProductAmount || order.orderAmount}`, 380, doc.y);
      doc.moveDown();
      
      if (order.shippingCharge) {
        doc.fontSize(10).text('Shipping Charge:', 300, doc.y);
        doc.text(`Rs.${order.shippingCharge}`, 380, doc.y);
        doc.moveDown(0.5);
      }
      
      if (order.discount) {
        doc.fontSize(10).text('Discount:', 300, doc.y);
        doc.text(`-Rs.${order.discount}`, 380, doc.y);
        doc.moveDown(0.5);
      }
      
      if (order.couponDiscount) {
        doc.fontSize(10).text('Coupon Discount:', 300, doc.y);
        doc.text(`-Rs.${order.couponDiscount}`, 380, doc.y);
        doc.moveDown(0.5);
      }
      
      doc.fontSize(12).text('Total Amount:', 300, doc.y, { bold: true });
      doc.fontSize(12).text(`Rs.${order.orderAmount}`, 380, doc.y, { bold: true });
      doc.moveDown();
      
      // Add footer
      doc.fontSize(10).text('Thank you for your business!', { align: 'center' });
      doc.moveDown();
      doc.fontSize(8).text('This is a computer-generated invoice and does not require a signature.', { align: 'center' });
      
      // Finalize the PDF and end the stream
      doc.end();
      
    } catch (error) {
      console.error('Error generating invoice:', error);
      res.status(500).json({ success: false, message: 'Failed to generate invoice' });
    }
  }

module.exports = {
  orders,
  orderDetails,
  placeOrder,
  cancelOrder,
  generateInvoice
};
