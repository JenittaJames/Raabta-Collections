const productModel = require("../../models/productSchema");
const catModel = require("../../models/categorySchema");
const userModel = require("../../models/userSchema")
const ordersModel = require("../../models/orderSchema")
const addressModel = require("../../models/addressSchema")



const orders = async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = 10;
        const skip = (page - 1) * limit;
        
        const totalOrders = await ordersModel.countDocuments();
        const totalPages = Math.ceil(totalOrders / limit);
        
        const ordersData = await ordersModel.find()
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit)
            .populate('userId', 'userName');
        
        const order = ordersData.map(order => {
            return {
                id: order._id,
                orderNumber: order.orderNumber || order._id.toString().slice(-6).toUpperCase(),
                userName: order.userId ? order.userId.userName : 'Unknown',
                orderDate: order.createdAt,
                totalAmount: order.orderAmount,
                status: order.orderStatus,
                paymentStatus: order.paymentStatus
            };
        });
        
        res.render('admin/orders', {
            order,
            currentPage: page,
            totalPages
        });
        
    } catch (error) {
        console.error('Error fetching orders:', error);
        res.status(500).render('error', { message: 'Error loading orders' });
    }
};



const orderDetails = async (req, res) => {
    try {
        const orderId = req.params.orderId;
        
        const order = await ordersModel.findById(orderId)
            .populate({
                path: 'orderedItem.productId',
                model: 'Product'
            })
            .populate('userId');

        
        if (!order) {
            return res.status(404).render('error', { message: 'Order not found' });
        }
        
        // Get the delivery address from the order
        const address = order.deliveryAddress && order.deliveryAddress.length > 0 
            ? order.deliveryAddress[0] 
            : await addressModel.findOne({ userId: order.userId });

        
        res.render('admin/orderdetails', { order, address });
    } catch (error) {
        console.error('Error in admin orderDetails:', error);
        res.status(500).render('error', { message: 'Failed to load order details' });
    }
};



module.exports = {
    orders,
    orderDetails,
}