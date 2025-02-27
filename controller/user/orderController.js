const userModel = require('../../models/userSchema')
const addressModel = require('../../models/addressSchema')
const ordersModel = require('../../models/orderSchema')
const cartModel = require('../../models/cartSchema')



const orders = async (req, res) => {
    try {
        const orders = await ordersModel.find({ userId: req.session.userId })
            .populate({
                path: 'orderedItem.productId',
                model: 'Product'  // Make sure this matches your product model name exactly
            })
            .populate('userId')
            .sort('-createdAt');
        
        res.render('user/orders', { orders });
    } catch (error) {
        console.error('Error in loadOrders:', error);
        res.render('orders', { orders: [], error: 'Failed to load orders' });
    }
};


const orderDetails = async (req, res) => {
  try {

    console.log("ividuthe order details eathhaa.....");
      const orderId = req.params.orderId;
      const userId = req.session.userId;

      const order = await ordersModel.findOne({ _id: orderId, userId })
          .populate({
            path: 'orderedItem.productId',
            model: 'Product'  // Make sure this matches your product model name exactly
        })
          .populate('userId');

      if (!order) {
          return res.status(404).render('error', { message: 'Order not found' });
      }

      res.render('user/orderDetails', { order });

  } catch (error) {
      console.error('Error in getOrderDetails:', error);
      res.status(500).render('error', { message: 'Failed to load order details' });
  }
}



const placeOrder = async (req, res) => {
    try {

        const userId = req.session.userId;
        const user = await userModel.findById(userId);

        const cart = await cartModel.findOne({ user: userId  })
            .populate('cartItem.productId');
        
        if (!cart || cart.cartItem.length === 0) {
            return res.status(400).send('No items in cart');
        }
        
        const address = await addressModel.findOne({ userId});
        
        if (!address) {
            return res.status(400).send('No delivery address found');
        }
        
        // Calculate total amount
        let totalAmount = 0;
        const orderedItems = cart.cartItem.map(item => {
            const itemTotal = item.quantity * item.productId.price;
            totalAmount += itemTotal;
            
            return {
                productId: item.productId._id,
                quantity: item.quantity,
                productPrice: item.productId.price,
                productStatus: "pending",
                totalProductPrice: itemTotal
            };
        });
        
        // Create a new order
        const newOrder = new ordersModel({
            userId: userId,
            cartId: cart._id,
            orderedItem: orderedItems,
            deliveryAddress: [address],
            orderAmount: totalAmount,
            paymentMethod: "Cash on Delivery", 
            paymentStatus: "pending"
        });

        
        await newOrder.save();
        
        await cartModel.deleteOne({user : userId});
        
        const orderNumber = 'ORD' + Math.floor(Math.random() * 1000000);
        
        res.render('user/confirmorder', { 
            order: {
                customerName: user.username || user.name || 'Customer',
                orderNumber: orderNumber,
                _id: newOrder._id,
                orderAmount: totalAmount,
                items: orderedItems,
            }
        });
        
    } catch (error) {
        console.log("Error occurred while placing the order", error);
        res.status(500).send('An error occurred while placing your order');
    }
}


module.exports = {
    orders,
    orderDetails,
    placeOrder,
}