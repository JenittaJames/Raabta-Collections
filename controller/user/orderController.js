const userModel = require('../../models/userSchema')
const addressModel = require('../../models/addressSchema')
const ordersModel = require('../../models/orderSchema')
const cartModel = require('../../models/cartSchema')



const orders = async (req, res) => {
    try {
        const orders = await ordersModel.find({ userId: req.session.userId })
            .populate('orderedItem.productId')
            .populate('userId')
            .sort('-createdAt');


            console.log("ordersseeeeeee",orders);
        
        res.render('user/orders', { orders });
    } catch (error) {
        console.error('Error in loadOrders:', error);
        res.render('orders', { orders: [], error: 'Failed to load orders' });
    }
};


const placeOrder = async (req, res) => {
  try {
      const userId = req.session.userId ;
      const { addressId, paymentMethod } = req.body;

      const cart = await cartModel.findOne({ userId })
          .populate('cartItem.productId');

      if (!cart || cart.items.length === 0) {
          return res.status(400).json({ success: false, message: 'Cart is empty' });
      }

      // Get user's address
      const user = await userModel.findById(userId);
      const deliveryAddress = user.address.find(addr => addr._id.toString() === addressId);

      if (!deliveryAddress) {
          return res.status(400).json({ success: false, message: 'Invalid delivery address' });
      }

      // Prepare ordered items
      const orderedItems = cart.item.map(item => ({
          productId: item.productId._id,
          quantity: item.quantity,
          productPrice: item.productId.price,
          productStatus: 'pending',
          totalProductPrice: item.quantity * item.productId.price
      }));

      // Calculate total order amount
      const orderAmount = orderedItems.reduce((total, item) => total + item.totalProductPrice, 0);

      // Create new order
      const newOrder = new Order({
          userId,
          cartId: cart._id,
          orderedItem: orderedItems,
          deliveryAddress: [deliveryAddress],
          orderAmount,
          paymentMethod,
          paymentStatus: paymentMethod === 'COD' ? 'pending' : 'completed',
      });

      await newOrder.save();

      // Clear cart after order placement
      await Cart.findByIdAndUpdate(cart._id, { $set: { items: [] } });

      // Update product stock
      for (const item of orderedItems) {
          await Product.findByIdAndUpdate(item.productId, {
              $inc: { stock: -item.quantity }
          });
      }

      res.status(200).json({
          success: true,
          message: 'Order placed successfully',
          orderId: newOrder._id
      });

  } catch (error) {
      console.error('Error in placeOrder:', error);
      res.status(500).json({ success: false, message: 'Failed to place order' });
  }
}


const orderDetails = async (req, res) => {
  try {
      const orderId = req.params.orderId;
      const userId = req.session.userId;

      const order = await ordersModel.findOne({ _id: orderId, userId })
          .populate('orderedItem.productId')
          .populate('userId');

      if (!order) {
          return res.status(404).render('error', { message: 'Order not found' });
      }

      res.render('/orderDetails', { order });

  } catch (error) {
      console.error('Error in getOrderDetails:', error);
      res.status(500).render('error', { message: 'Failed to load order details' });
  }
}




module.exports = {
    orders,
    placeOrder,
    orderDetails,
}