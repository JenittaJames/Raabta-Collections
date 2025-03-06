const productModel = require("../../models/productSchema");
const catModel = require("../../models/categorySchema");
const userModel = require("../../models/userSchema")
const ordersModel = require("../../models/orderSchema")
const addressModel = require("../../models/addressSchema")

const orders = async (req, res) => {
    try {
        const { query } = req.query;
        const searchQuery = query || "";
        
        const page = parseInt(req.query.page) || 1;
        const limit = 10;
        const skip = (page - 1) * limit;
        
        // Prepare the search filter
        let filter = {};
        
        if (searchQuery) {
            // We'll need to search in the related data
            // First, find user IDs that match the search query
            const matchingUsers = await require('mongoose').model('User').find({
                userName: { $regex: searchQuery, $options: 'i' }
            }).select('_id');
            
            const userIds = matchingUsers.map(user => user._id);
            
            filter = {
                $or: [
                    { orderNumber: { $regex: searchQuery, $options: 'i' } },
                    { orderStatus: { $regex: searchQuery, $options: 'i' } },
                    { paymentStatus: { $regex: searchQuery, $options: 'i' } },
                    { userId: { $in: userIds } }
                ]
            };
        }
        
        const totalOrders = await ordersModel.countDocuments(filter);
        const totalPages = Math.ceil(totalOrders / limit);
        
        const ordersData = await ordersModel.find(filter)
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit)
            .populate('userId', 'userName');
        
        const order = ordersData.map(order => {
            // Check if any products have return requests
            const hasReturnRequest = order.orderedItem.some(item => 
                item.productStatus === 'Return Requested'
            );
            
            const hasReturnApproved = order.orderedItem.some(item => 
                item.productStatus === 'Return Approved'
            );
            
            const hasReturnRejected = order.orderedItem.some(item => 
                item.productStatus === 'Return Rejected'
            );
            
            return {
                id: order._id,
                orderNumber: order.orderNumber || order._id.toString().slice(-6).toUpperCase(),
                userName: order.userId ? order.userId.userName : 'Unknown',
                orderDate: order.createdAt,
                totalAmount: order.orderAmount,
                status: order.orderStatus,
                paymentStatus: order.paymentStatus,
                hasReturnRequest,
                hasReturnApproved,
                hasReturnRejected
            };
        });
        
        res.render('admin/orders', {
            order,
            searchQuery,
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

const verifyReturnRequest = async (req, res) => {
    try {
        const { orderId, productId, status } = req.body;
        
        const order = await ordersModel.findById(orderId);
        if (!order) {
            return res.status(404).json({ success: false, message: 'Order not found' });
        }
        
        const orderItem = order.orderedItem.find(item => item._id.toString() === productId);
        if (!orderItem) {
            return res.status(404).json({ success: false, message: 'Product not found in this order' });
        }
        
        orderItem.productStatus = status;
        
        if (status === 'Return Approved') {
            const user = await userModel.findById(order.userId);
            if (!user) {
                return res.status(404).json({ success: false, message: 'User not found' });
            }
            
            const refundAmount = orderItem.totalProductPrice;
            user.wallet += refundAmount;
            user.walletHistory.push({
                amount: refundAmount,
                type: 'credit',
                description: `Refund for return of order #${order.orderNumber}`,
                date: new Date()
            });
            
            await user.save();
            
            const allItemsReturned = order.orderedItem.every(item => 
                item.productStatus === 'Return Approved' || item.productStatus === 'Cancelled'
            );
            
            if (allItemsReturned) {
                order.paymentStatus = 'refunded';
            }
        }
        
        await order.save();
        
        return res.json({ 
            success: true, 
            message: `Return request ${status === 'Return Approved' ? 'approved and refund processed' : 'rejected'}`
        });
    } catch (error) {
        console.error('Error processing return verification:', error);
        return res.status(500).json({ success: false, message: 'Failed to process return verification' });
    }
};

module.exports = {
    orders,
    orderDetails,
    verifyReturnRequest
};