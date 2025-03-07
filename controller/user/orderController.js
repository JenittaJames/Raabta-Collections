const userModel = require('../../models/userSchema')
const addressModel = require('../../models/addressSchema')
const ordersModel = require('../../models/orderSchema')
const cartModel = require('../../models/cartSchema')
const productModel = require('../../models/productSchema')



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
                productStatus: "Pending",
                totalProductPrice: itemTotal
            };
        });


        const orderNumber = 'ORD' + Math.floor(Math.random() * 1000000);
        
        // Create a new order
        const newOrder = new ordersModel({
            userId: userId,
            cartId: cart._id,
            orderNumber : orderNumber,
            orderedItem: orderedItems,
            deliveryAddress: address,
            orderAmount: totalAmount,
            paymentMethod: "Cash on Delivery", 
            paymentStatus: "pending",
            orderStatus: "Pending"
        });

        
        await newOrder.save();
        
        await cartModel.deleteOne({user : userId});

        
        res.render('user/confirmorder', { 
            order: {
                customerName: user.username || user.name || 'Customer',
                orderNumber: orderNumber,
                _id: newOrder._id,
                orderAmount: totalAmount,
                items: orderedItems,
                orderStatus: newOrder.orderStatus
            }
        });
        
    } catch (error) {
        console.log("Error occurred while placing the order", error);
        res.status(500).send('An error occurred while placing your order');
    }
}



const orderDetails = async (req, res) => {
    try {
        const orderId = req.params.orderId;
        const userId = req.session.userId;
        
        const order = await ordersModel.findOne({ _id: orderId, userId })
            .populate({
                path: 'orderedItem.productId',
                model: 'Product'
            })
            .populate('userId');
        
        if (!order) {
            return res.status(404).render('error', { message: 'Order not found' });
        }
        
        const address = await addressModel.findOne({ userId: userId });
        
        res.render('user/orderdetails', { order, address });
    } catch (error) {
        console.error('Error in getOrderDetails:', error);
        res.status(500).render('error', { message: 'Failed to load order details' });
    }
}



const cancelOrder = async (req, res) => {
    try {
        const orderId = req.params.orderId || req.body.orderId || req.query.orderId;
        console.log("Final orderId:", orderId);
      
        // Find the order without modifying it first
        const order = await ordersModel.findById(orderId);
        
        if (!order) {
            return res.status(404).json({ success: false, message: 'Order not found' });
        }
        
        // Update the order status to 'Cancelled'
        order.orderStatus = 'Cancelled';
        
        // Update the status of each product in the orderedItem array
        order.orderedItem.forEach(item => {
            item.productStatus = 'Cancelled';
        });
        
        // Update inventory
        for (const item of order.orderedItem) {
            const product = await productModel.findById(item.productId);
            if (product) {
                product.stock += item.quantity; // Increase the stock by the quantity ordered
                await product.save();
            }
        }
        
        // Save the modified order
        await order.save();
        
        return res.status(200).json({ success: true, message: 'Order cancelled successfully' });
    } catch (error) {
        console.warn('Error cancelling order:', error);
        return res.status(500).json({ success: false, message: 'Failed to cancel order' });
    }
};




module.exports = {
    orders,
    orderDetails,
    placeOrder,
    cancelOrder,
}